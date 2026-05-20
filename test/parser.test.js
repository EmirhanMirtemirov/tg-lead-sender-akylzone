"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLeadMessage, normalizePhone, dedupeRows } = require("../src/parser");

const sample = `🆘 Агент собрал необходимые данные!
📡 Канал: instagram

   - номер телефона: 0550404536
   - каласс ученика: 7-класс

💬 Контекст: "Клиентка — мама ребенка, который закончил 6 класс и интересуется подготовкой к лицею Акылман. Она спрашивает, как скачать платформу Akylzone и есть ли филиал лицея Акылман в городе Манас. Менеджер уже получил ее номер и сообщил, что специалист свяжется для предоставления подробной информации."
🕒 Время: 2026-05-18 18:28

🔗 Перейти в диалог

🤖 Fusion AI Agent`;

test("parses the Fusion AI lead message format", () => {
  const lead = parseLeadMessage(sample);

  assert.equal(lead.phone, "+996 550 404 536");
  assert.equal(lead.grade, "7-класс");
  assert.equal(lead.name, "Не указано");
  assert.equal(lead.time, "2026-05-18 18:28");
  assert.equal(lead.channel, "instagram");
  assert.match(lead.context, /мама ребенка/);
  assert.equal(lead.isComplete, true);
  assert.deepEqual(lead.row, [
    "",
    "2026-05-18 18:28",
    "instagram",
    "Не указано",
    "+996 550 404 536",
    "7-класс",
    lead.context,
  ]);
});

test("captures client name when the message includes one", () => {
  const withName = sample.replace(
    "   - номер телефона: 0550404536",
    "   - имя клиента: Айгерим\n   - номер телефона: 0550404536",
  );
  const lead = parseLeadMessage(withName);

  assert.equal(lead.name, "Айгерим");
  assert.equal(lead.row[3], "Айгерим");
});

test("normalizes common Kyrgyzstan phone formats", () => {
  assert.equal(normalizePhone("0550404536"), "+996 550 404 536");
  assert.equal(normalizePhone("550404536"), "+996 550 404 536");
  assert.equal(normalizePhone("+996550404536"), "+996 550 404 536");
});

test("normalizes common Russian phone formats", () => {
  assert.equal(normalizePhone("89991234567"), "+7 999 123-45-67");
  assert.equal(normalizePhone("+79991234567"), "+7 999 123-45-67");
});

test("dedupeRows drops phones already in the sheet and repeats within the batch", () => {
  const existing = new Set([normalizePhone("0550404536")]);
  const row = (phone) => ["", "t", "instagram", "Не указано", phone, "7", "ctx"];
  const rows = [
    row("+996 550 404 536"), // already in the sheet
    row("+996 222 222 222"), // new
    row("+996 222 222 222"), // duplicate within the batch
    row("0707000000"), // new
  ];

  const { unique, duplicates } = dedupeRows(rows, existing);

  assert.equal(unique.length, 2);
  assert.equal(duplicates, 2);
  assert.equal(unique[0][4], "+996 222 222 222");
  assert.equal(unique[1][4], "0707000000");
});
