"use strict";

function readBoolean(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return defaultValue;
  return ["1", "true", "yes", "y", "да"].includes(value.toLowerCase());
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function readConfig() {
  const sheetName = process.env.SHEET_NAME || "";

  return {
    telegramBotToken: required("TELEGRAM_BOT_TOKEN"),
    sourceChannelId: process.env.SOURCE_CHANNEL_ID || "",
    allowedSenderBotId: process.env.ALLOWED_SENDER_BOT_ID || "",
    allowedSenderFallbackText: process.env.ALLOWED_SENDER_FALLBACK_TEXT || "",
    requireSenderId: readBoolean("REQUIRE_SENDER_ID", false),
    spreadsheetId: process.env.SPREADSHEET_ID || "",
    spreadsheetName: process.env.SPREADSHEET_NAME || "",
    sheetName,
    sheetRange: process.env.SHEET_RANGE || `${sheetName || "Лист1"}!A:G`,
    googleApplicationCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || "",
    googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "",
    dryRun: readBoolean("DRY_RUN", false),
  };
}

module.exports = {
  readConfig,
};
