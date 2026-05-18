# Project Context: Telegram Leads to Google Sheets

## Коротко

Проект `tg-lead-sender-akylzone` - это Telegram-бот на Node.js, который слушает посты в Telegram-канале, парсит лиды из сообщений другого бота и добавляет их в Google Sheets.

Репозиторий:

```text
https://github.com/EmirhanMirtemirov/tg-lead-sender-akylzone
```

Локальная папка проекта:

```text
/Users/admin/Desktop/tg lead sender
```

## Задача проекта

Есть чужой Telegram-бот, который публикует в канал сообщения примерно такого вида:

```text
🆘 Агент собрал необходимые данные!
📡 Канал: instagram

   - номер телефона: 0550404536
   - каласс ученика: 7-класс

💬 Контекст: "Клиентка — мама ребенка, который закончил 6 класс..."
🕒 Время: 2026-05-18 18:28

🔗 Перейти в диалог

🤖 Fusion AI Agent
```

Наш бот должен:

1. Получить новый пост из канала.
2. Проверить, что сообщение относится к нужному источнику.
3. Достать телефон, класс, время и контекст.
4. Добавить новую строку в Google Sheets.

Формат строки в таблице:

```text
A: номер телефона
B: класс
C: время/дата
D: контекст/summary
```

## Важный принцип работы с таблицей

Бот не перезаписывает существующие данные и не очищает таблицу.

В коде используется Google Sheets append:

```js
insertDataOption: "INSERT_ROWS"
```

То есть новые лиды добавляются в конец листа как новые строки. Существующие строки остаются на месте.

## Google Sheets

Обсуждаемая таблица:

```text
new_marketing
```

Лист:

```text
insta
```

Диапазон для записи:

```text
insta!A:D
```

Можно использовать либо `SPREADSHEET_ID`, либо `SPREADSHEET_NAME`.

Лучше использовать `SPREADSHEET_ID`, если он известен, потому что название таблицы может повторяться. Сейчас проект поддерживает оба варианта.

## Telegram-фильтр

Основной фильтр:

```env
ALLOWED_SENDER_FALLBACK_TEXT=Fusion AI Agent
```

Зачем нужен fallback:

Telegram в `channel_post` иногда не отдает надежный `from.id` отправившего бота. Поэтому наш бот проверяет текст/подпись сообщения. Если в сообщении есть `Fusion AI Agent`, он считает его подходящим источником.

Если позже будет известен точный id чужого бота, можно добавить:

```env
ALLOWED_SENDER_BOT_ID=123456789
```

Но `ALLOWED_SENDER_FALLBACK_TEXT=Fusion AI Agent` лучше оставить как запасной фильтр.

## Что уже сделано

Создан Node.js проект.

Основные файлы:

```text
src/index.js          Telegram bot, обработка channel_post, фильтры, dry-run
src/parser.js         Парсинг сообщения и форматирование телефонов
src/googleSheets.js   Авторизация Google и append строки
src/config.js         Чтение переменных окружения
test/parser.test.js   Тесты парсера
.env.example          Пример переменных окружения
README.md             Инструкция запуска
```

Установленные зависимости:

```text
telegraf
googleapis
dotenv
```

Команды:

```bash
npm install
npm start
npm test
```

Тесты парсера проходили успешно:

```text
3 tests passed
```

## Форматирование телефона

В `src/parser.js` перенесена логика из Python-функции пользователя.

Поддерживается:

```text
0550404536    -> +996 550 404 536
550404536     -> +996 550 404 536
+996550404536 -> +996 550 404 536
89991234567   -> +7 999 123-45-67
+79991234567  -> +7 999 123-45-67
```

## Railway deployment

Проект деплоится на Railway как один service.

Нужно только:

```text
Railway Project
└── 1 Service: tg-lead-sender-akylzone
```

База данных, Redis, storage и отдельные блоки не нужны.

Start command:

```bash
npm start
```

Railway запускает:

```bash
node src/index.js
```

## Railway Variables

В Railway нужно заполнить переменные окружения. Локальный `.env` не попадает в GitHub и не виден Railway.

Обязательные/полезные переменные:

```env
TELEGRAM_BOT_TOKEN=новый_токен_бота
ALLOWED_SENDER_FALLBACK_TEXT=Fusion AI Agent
REQUIRE_SENDER_ID=false

SPREADSHEET_NAME=new_marketing
SHEET_NAME=insta
SHEET_RANGE=insta!A:D

GOOGLE_SERVICE_ACCOUNT_JSON={полный service account JSON в одну строку}

DRY_RUN=true
```

Опционально:

```env
SOURCE_CHANNEL_ID=-100...
ALLOWED_SENDER_BOT_ID=...
SPREADSHEET_ID=...
```

На Railway не нужно использовать:

```env
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

Причина: файла `service-account.json` на Railway нет. Для Railway используется именно:

```env
GOOGLE_SERVICE_ACCOUNT_JSON
```

В `src/googleSheets.js` сделана правка: если задан `GOOGLE_SERVICE_ACCOUNT_JSON`, он имеет приоритет над `GOOGLE_APPLICATION_CREDENTIALS`.

## Как вставлять Google service account в Railway

В `GOOGLE_SERVICE_ACCOUNT_JSON` вставляется полный JSON-объект service account.

Нельзя вставлять:

```python
json_data =
```

Нужно вставить только JSON от `{` до `}`:

```json
{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"...","universe_domain":"googleapis.com"}
```

Также нужно открыть Google Sheet и дать email service account права редактора.

## Безопасность

В чат ранее были отправлены:

1. Telegram bot token.
2. Google service account private key.

Эти секреты не были закоммичены в GitHub, но они уже были раскрыты в чате. Перед боевым запуском лучше:

1. В `@BotFather` сделать `/revoke` для Telegram bot token и заменить токен в Railway.
2. В Google Cloud удалить старый service account key и создать новый.
3. В Railway заменить `GOOGLE_SERVICE_ACCOUNT_JSON` на новый JSON.

В репозитории `.gitignore` исключает:

```text
.env
service-account.json
node_modules/
```

## Текущий статус GitHub

Проект был запушен в GitHub.

Первый commit:

```text
7f7f4a7 Initial Telegram lead sender bot
```

Позже был добавлен commit:

```text
917d9e8 Prefer service account JSON env on Railway
```

Репозиторий на момент обсуждения был public. Секреты туда не попали, но для такого проекта лучше сделать repo private.

## Как тестировать

Сначала держать:

```env
DRY_RUN=true
```

В этом режиме бот парсит сообщения и пишет результат в Railway Logs, но не добавляет строки в таблицу.

Быстрый тест:

1. Запустить Railway service.
2. Написать нашему боту в личку полный пример сообщения.
3. В логах Railway должна появиться строка:

```text
[dry-run] parsed private test row: [...]
```

Тест через канал:

1. Добавить нашего бота админом в канал.
2. Дождаться нового сообщения от чужого бота.
3. В логах должна появиться строка:

```text
[dry-run] parsed row: [...]
```

После проверки поменять:

```env
DRY_RUN=false
```

После этого новые лиды будут добавляться в Google Sheet.

## Типичные ошибки

### Missing required env var: TELEGRAM_BOT_TOKEN

Railway не видит локальный `.env`. Нужно добавить `TELEGRAM_BOT_TOKEN` в Railway Variables.

### Railway ищет ./service-account.json

Удалить `GOOGLE_APPLICATION_CREDENTIALS` из Railway Variables и заполнить `GOOGLE_SERVICE_ACCOUNT_JSON`.

### Бот ничего не пишет в таблицу

Проверить:

1. `DRY_RUN=false`.
2. `GOOGLE_SERVICE_ACCOUNT_JSON` заполнен полным JSON.
3. Service account имеет доступ редактора к таблице.
4. `SPREADSHEET_NAME` или `SPREADSHEET_ID` правильный.
5. `SHEET_RANGE=insta!A:D`.
6. Бот добавлен админом в Telegram-канал.

### Бот реагирует не на те сообщения

Проверить:

```env
ALLOWED_SENDER_FALLBACK_TEXT=Fusion AI Agent
```

И желательно добавить:

```env
SOURCE_CHANNEL_ID=-100...
```

## Что новому агенту нужно помнить

1. Не просить пользователя снова объяснять проект с нуля - основной контекст здесь.
2. Не коммитить `.env`, `service-account.json`, токены или private keys.
3. Для Railway использовать `GOOGLE_SERVICE_ACCOUNT_JSON`, а не файл.
4. Таблица должна только дополняться новыми строками, старые данные трогать нельзя.
5. Основной рабочий путь: Telegram channel post -> parser -> Google Sheets append.
6. Перед боевым запуском рекомендовать перевыпустить раскрытые секреты.
