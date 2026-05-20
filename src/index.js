"use strict";

require("dotenv").config();

const { Telegraf } = require("telegraf");
const { readConfig } = require("./config");
const { createSheetsClient, appendLeadRows, readExistingPhones } = require("./googleSheets");
const { parseLeadMessage, dedupeRows } = require("./parser");

const FLUSH_DELAY_MS = 2000;
const MAX_BATCH = 100;

function buildSummary({ added, duplicates, skipped, failed }) {
  const parts = [`✅ Добавлено: ${added}`];
  if (duplicates > 0) parts.push(`🔁 Дубликаты (пропущены): ${duplicates}`);
  if (skipped > 0) parts.push(`⚠️ Не распознано: ${skipped}`);
  if (failed > 0) parts.push(`❌ Не записалось: ${failed}`);
  return parts.join("\n");
}

// Buffers parsed rows and writes them to the sheet in one batched append,
// so a burst of forwarded messages stays well under Google's write quota.
function createRowQueue(config, sheets, telegram) {
  let rows = [];
  let skipped = 0;
  let replyChatId = null;
  let timer = null;

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (rows.length === 0 && skipped === 0) return;

    const batch = rows;
    const skippedCount = skipped;
    const chatId = replyChatId;
    rows = [];
    skipped = 0;
    replyChatId = null;

    let added = 0;
    let duplicates = 0;
    let failed = 0;

    if (batch.length > 0) {
      let toAppend = batch;
      try {
        const existing = await readExistingPhones(sheets, config);
        const result = dedupeRows(batch, existing);
        toAppend = result.unique;
        duplicates = result.duplicates;
      } catch (error) {
        console.error(
          "[warn] dedup check failed, appending without dedup:",
          error?.message || String(error),
        );
      }

      try {
        if (toAppend.length > 0) await appendLeadRows(sheets, config, toAppend);
        added = toAppend.length;
        console.log(`[ok] appended ${added} lead(s), ${duplicates} duplicate(s) skipped`);
      } catch (error) {
        failed = toAppend.length;
        console.error(
          `[error] failed to append ${toAppend.length} lead(s):`,
          error?.message || String(error),
        );
      }
    }

    if (chatId && telegram) {
      try {
        await telegram.sendMessage(
          chatId,
          buildSummary({ added, duplicates, skipped: skippedCount, failed }),
        );
      } catch (error) {
        console.error("[error] failed to send summary:", error?.message || String(error));
      }
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    if (rows.length >= MAX_BATCH) {
      flush();
      return;
    }
    timer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  function addLead(row, chatId) {
    rows.push(row);
    if (chatId) replyChatId = chatId;
    schedule();
  }

  function addSkipped(chatId) {
    skipped += 1;
    if (chatId) replyChatId = chatId;
    schedule();
  }

  return { addLead, addSkipped, flush };
}

function textOf(message) {
  return message.text || message.caption || "";
}

function senderIdOf(message) {
  return message.from?.id || message.sender_business_bot?.id || "";
}

function hasFallbackSenderText(message, config) {
  if (!config.allowedSenderFallbackText) return false;

  const needle = config.allowedSenderFallbackText.toLowerCase();
  const haystack = [
    message.author_signature,
    message.forward_signature,
    message.forward_sender_name,
    textOf(message),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return haystack.includes(needle);
}

function isAllowedSource(message, config) {
  if (config.sourceChannelId && String(message.chat?.id) !== String(config.sourceChannelId)) {
    return { ok: false, reason: `ignored channel ${message.chat?.id}` };
  }

  if (!config.allowedSenderBotId && !config.allowedSenderFallbackText) {
    return { ok: true, reason: "sender filter disabled" };
  }

  const senderId = senderIdOf(message);
  if (senderId && config.allowedSenderBotId) {
    return String(senderId) === String(config.allowedSenderBotId)
      ? { ok: true, reason: `allowed sender ${senderId}` }
      : { ok: false, reason: `ignored sender ${senderId}` };
  }

  if (hasFallbackSenderText(message, config)) {
    return { ok: true, reason: "allowed by fallback sender text" };
  }

  return {
    ok: false,
    reason: config.requireSenderId
      ? "sender id is missing and REQUIRE_SENDER_ID=true"
      : "sender id is missing and fallback sender text did not match",
  };
}

function handleLeadPost(message, config, queue) {
  const source = isAllowedSource(message, config);
  if (!source.ok) {
    console.log(`[skip] ${source.reason}`);
    return;
  }

  const lead = parseLeadMessage(textOf(message));

  if (!lead.isComplete) {
    console.log("[skip] message does not contain a complete lead");
    return;
  }

  if (config.dryRun) {
    console.log("[dry-run] parsed row:", lead.row);
    return;
  }

  queue.addLead(lead.row, null);
}

function handlePrivateLead(message, config, queue) {
  const text = textOf(message);
  if (text.startsWith("/")) return; // ignore bot commands like /start

  const chatId = message.chat?.id;
  const lead = parseLeadMessage(text);

  if (!lead.isComplete) {
    console.log("[skip] private message is not a complete lead", {
      phone: Boolean(lead.phone),
      grade: Boolean(lead.grade),
      time: Boolean(lead.time),
      context: Boolean(lead.context),
    });
    if (!config.dryRun) queue.addSkipped(chatId);
    return;
  }

  if (config.dryRun) {
    console.log("[dry-run] parsed private row:", lead.row);
    return;
  }

  queue.addLead(lead.row, chatId);
}

async function launchWithConflictRetry(bot) {
  const retryMs = 15000;

  while (true) {
    try {
      await bot.launch({ allowedUpdates: ["channel_post", "message"] });
      return;
    } catch (error) {
      if (error?.response?.error_code !== 409) throw error;
      console.error(
        `[warn] polling conflict (409): another bot instance is active — retrying in ${retryMs / 1000}s`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
}

async function main() {
  const config = readConfig();
  console.log(`Starting bot${config.dryRun ? " (DRY_RUN mode)" : ""}...`);

  const bot = new Telegraf(config.telegramBotToken);
  const sheets = config.dryRun ? null : await createSheetsClient(config);
  const queue = createRowQueue(config, sheets, bot.telegram);

  bot.on("channel_post", (ctx) => {
    try {
      handleLeadPost(ctx.channelPost, config, queue);
    } catch (error) {
      console.error("[error] failed to handle channel post:", error?.message || String(error));
    }
  });

  bot.on("message", (ctx) => {
    const chatType = ctx.chat?.type;

    try {
      if (chatType === "group" || chatType === "supergroup") {
        handleLeadPost(ctx.message, config, queue);
      } else if (chatType === "private") {
        handlePrivateLead(ctx.message, config, queue);
      }
    } catch (error) {
      console.error("[error] failed to handle message:", error?.message || String(error));
    }
  });

  console.log(`Bot is running${config.dryRun ? " in DRY_RUN mode" : ""}.`);

  launchWithConflictRetry(bot).catch((error) => {
    console.error("[fatal] bot stopped:", error?.description || error?.message || String(error));
    process.exit(1);
  });

  const shutdown = async (signal) => {
    console.log(`[shutdown] ${signal} — flushing buffered leads`);
    try {
      await queue.flush();
    } catch (error) {
      console.error("[shutdown] flush failed:", error?.message || String(error));
    }
    bot.stop(signal);
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});
