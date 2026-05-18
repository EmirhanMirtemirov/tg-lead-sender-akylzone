"use strict";

require("dotenv").config();

const { Telegraf } = require("telegraf");
const { readConfig } = require("./config");
const { createSheetsClient, appendLeadRow } = require("./googleSheets");
const { parseLeadMessage } = require("./parser");

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

async function handleLeadPost(message, config, sheets) {
  const source = isAllowedSource(message, config);
  if (!source.ok) {
    console.log(`[skip] ${source.reason}`);
    return;
  }

  const text = textOf(message);
  const lead = parseLeadMessage(text);

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

  await appendLeadRow(sheets, config, lead.row);
  console.log(`[ok] appended lead ${lead.phone} / ${lead.grade}`);
}

function handlePrivateDryRunMessage(message) {
  const lead = parseLeadMessage(textOf(message));

  if (!lead.isComplete) {
    console.log("[dry-run] private message is not a complete lead", {
      phone: Boolean(lead.phone),
      grade: Boolean(lead.grade),
      time: Boolean(lead.time),
      context: Boolean(lead.context),
    });
    return;
  }

  console.log("[dry-run] parsed private test row:", lead.row);
}

async function main() {
  const config = readConfig();
  console.log(`Starting bot${config.dryRun ? " (DRY_RUN mode)" : ""}...`);

  const bot = new Telegraf(config.telegramBotToken);
  const sheets = config.dryRun ? null : await createSheetsClient(config);

  bot.on("channel_post", async (ctx) => {
    try {
      await handleLeadPost(ctx.channelPost, config, sheets);
    } catch (error) {
      console.error("[error] failed to handle channel post:", error);
    }
  });

  bot.on("message", async (ctx) => {
    if (ctx.chat?.type !== "private") return;
    if (!config.dryRun) return;

    try {
      handlePrivateDryRunMessage(ctx.message);
    } catch (error) {
      console.error("[error] failed to handle private test message:", error);
    }
  });

  bot.launch({ allowedUpdates: ["channel_post", "message"] }).catch((error) => {
    console.error("[fatal] bot.launch failed:", error);
    process.exit(1);
  });

  console.log(`Bot is running${config.dryRun ? " in DRY_RUN mode" : ""}.`);

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});
