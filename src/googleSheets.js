"use strict";

const { google } = require("googleapis");

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseServiceAccountJson(value) {
  if (!value) return undefined;

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: ${error.message}`);
  }
}

async function resolveSpreadsheetId(auth, config) {
  if (config.spreadsheetId) return config.spreadsheetId;
  if (!config.spreadsheetName) throw new Error("Set SPREADSHEET_ID or SPREADSHEET_NAME");

  const drive = google.drive({ version: "v3", auth });
  const response = await drive.files.list({
    q: [
      "mimeType='application/vnd.google-apps.spreadsheet'",
      "trashed=false",
      `name='${escapeDriveQueryValue(config.spreadsheetName)}'`,
    ].join(" and "),
    fields: "files(id, name)",
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = response.data.files || [];
  if (files.length === 0) throw new Error(`Spreadsheet not found by name: ${config.spreadsheetName}`);
  if (files.length > 1) {
    console.warn(`[warn] found ${files.length} spreadsheets named "${config.spreadsheetName}", using ${files[0].id}`);
  }

  return files[0].id;
}

async function createSheetsClient(config) {
  const authOptions = {
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ],
  };

  const credentials = parseServiceAccountJson(config.googleServiceAccountJson);
  if (credentials) authOptions.credentials = credentials;
  else if (config.googleApplicationCredentials) authOptions.keyFile = config.googleApplicationCredentials;

  if (!authOptions.credentials && !authOptions.keyFile) {
    throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  const auth = new google.auth.GoogleAuth(authOptions);
  const spreadsheetId = await resolveSpreadsheetId(auth, config);

  return {
    spreadsheetId,
    sheets: google.sheets({ version: "v4", auth }),
  };
}

async function appendLeadRow(client, config, row) {
  return client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: config.sheetRange,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [row],
    },
  });
}

module.exports = {
  createSheetsClient,
  appendLeadRow,
};
