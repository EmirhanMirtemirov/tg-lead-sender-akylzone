"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseLeadMessage, normalizePhone } = require("../src/parser");

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
  assert.equal(lead.time, "2026-05-18 18:28");
  assert.equal(lead.channel, "instagram");
  assert.match(lead.context, /мама ребенка/);
  assert.equal(lead.isComplete, true);
  assert.deepEqual(lead.row, [
    "+996 550 404 536",
    "7-класс",
    "2026-05-18 18:28",
    lead.context,
  ]);
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
