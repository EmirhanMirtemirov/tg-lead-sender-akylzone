"use strict";

const FIELD_LINE_RE = /^\s*[-–]\s*([^:]+?)\s*:\s*(.+?)\s*$/u;

function cleanValue(value) {
  return String(value || "")
    .replace(/^["'«]\s*/u, "")
    .replace(/\s*["'»]$/u, "")
    .trim();
}

function normalizeKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(value) {
  const raw = cleanValue(value);
  let digits = raw.replace(/\D/g, "");

  if (digits.length < 9) return raw;
  if (digits.length === 10 && digits.startsWith("0")) digits = `996${digits.slice(1)}`;
  if (digits.length === 9 && ["7", "5", "2"].includes(digits[0])) digits = `996${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("996")) return `+996 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9)}`;
  if (digits.length >= 10) return `+${digits}`;
  return raw;
}

function extractContext(text) {
  const match = text.match(/(?:^|\n)\s*💬\s*Контекст\s*:\s*([\s\S]*?)(?=\n\s*🕒|\n\s*🔗|\n\s*🤖|$)/u);
  return match ? cleanValue(match[1]) : "";
}

function extractTime(text) {
  const match = text.match(/(?:^|\n)\s*🕒\s*Время\s*:\s*(.+?)\s*$/mu);
  return match ? cleanValue(match[1]) : "";
}

function extractChannel(text) {
  const match = text.match(/(?:^|\n)\s*📡\s*Канал\s*:\s*(.+?)\s*$/mu);
  return match ? cleanValue(match[1]) : "";
}

function parseFields(text) {
  const fields = new Map();

  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(FIELD_LINE_RE);
    if (!match) continue;
    fields.set(normalizeKey(match[1]), cleanValue(match[2]));
  }

  return fields;
}

function findByKey(fields, predicates) {
  for (const [key, value] of fields.entries()) {
    if (predicates.some((predicate) => predicate(key))) return value;
  }
  return "";
}

function parseLeadMessage(text) {
  const messageText = String(text || "").trim();
  const fields = parseFields(messageText);

  const phone = findByKey(fields, [
    (key) => key.includes("телефон"),
    (key) => key.includes("номер"),
  ]);

  const grade = findByKey(fields, [
    (key) => key.includes("класс"),
    (key) => key.includes("каласс"),
    (key) => key.includes("class"),
    (key) => key.includes("grade"),
  ]);

  const name = findByKey(fields, [
    (key) => key.includes("имя"),
    (key) => key.includes("name"),
  ]);

  const lead = {
    phone: normalizePhone(phone),
    grade: cleanValue(grade),
    name: cleanValue(name) || "Не указано",
    time: extractTime(messageText),
    context: extractContext(messageText),
    channel: extractChannel(messageText),
  };

  lead.isComplete = Boolean(lead.phone && lead.grade && lead.time && lead.context);
  lead.row = ["", lead.time, lead.channel, lead.name, lead.phone, lead.grade, lead.context];

  return lead;
}

// Row column E (index 4) holds the phone; see the lead.row layout above.
const PHONE_COLUMN_INDEX = 4;

function dedupeRows(rows, existingPhones) {
  const seen = new Set();
  const unique = [];
  let duplicates = 0;

  for (const row of rows) {
    const key = normalizePhone(row[PHONE_COLUMN_INDEX]);
    if (existingPhones.has(key) || seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(row);
  }

  return { unique, duplicates };
}

module.exports = {
  parseLeadMessage,
  normalizePhone,
  dedupeRows,
};
