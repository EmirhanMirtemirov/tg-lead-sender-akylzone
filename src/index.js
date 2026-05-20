"use strict";

require("dotenv").config();

const { Telegraf } = require("telegraf");
const { readConfig } = require("./config");
const { createSheetsClient, appendLeadRows } = require("./googleSheets");
const { parseLeadMessage } = require("./parser");

const FLUSH_DELAY_MS = 2000;
const MAX_BATCH = 100;

// Buffers parsed rows and writes them to the sheet in one batched append,
// so a burst of forwarded messages stays well under Google's write quota.
function createRowQueue(config, sheets) {
  const pending = [];
  let timer = null;

  async function flush() {
    timer = null;
    if (pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    try {
      await appendLeadRows(sheets, config, batch);
      console.log(`[ok] appended ${batch.length} lead(s) to the sheet`);
    } catch (error) {
      console.error(
        `[error] failed to append ${batch.length} lead(s):`,
        error?.message || String(error),
      );
    }
  }

  function add(row) {
    pending.push(row);
    if (timer) clearTimeout(timer);
    if (pending.length >= MAX_BATCH) {
      flush();
      return;
    }
    timer = setTimeout(flush, FLUSH_DELAY_MS);
  }

  return { add };
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
    console.log("[skip] message does not contain a complete lead", {
      phone: Boolean(lead.phone),
      grade: Boolean(lead.grade),
      time: Boolean(lead.time),
      context: Boolean(lead.context),
    });
    return;
  }

  if (config.dryRun) {
    console.log("[dry-run] parsed row:", lead.row);
    return;
  }

  queue.add(lead.row);
}

function handlePrivateLead(message, config, queue) {
  const lead = parseLeadMessage(textOf(message));

  if (!lead.isComplete) {
    console.log("[skip] private message is not a complete lead", {
      phone: Boolean(lead.phone),
      grade: Boolean(lead.grade),
      time: Boolean(lead.time),
      context: Boolean(lead.context),
    });
    return;
  }

  if (config.dryRun) {
    console.log("[dry-run] parsed private row:", lead.row);
    return;
  }

  queue.add(lead.row);
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
  const queue = createRowQueue(config, sheets);

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

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});
