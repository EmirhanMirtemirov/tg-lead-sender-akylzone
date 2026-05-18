# TG Lead Sender

Бот слушает новые посты в Telegram-канале, парсит лиды из сообщения другого бота и добавляет строку в Google Sheets:

| A | B | C | D |
|---|---|---|---|
| номер телефона | класс ученика | время | контекст |

## Быстрый запуск

1. Установите зависимости:

```bash
npm install
```

2. Скопируйте конфиг:

```bash
cp .env.example .env
```

3. Заполните `.env`. Для вашей таблицы можно так:

```env
TELEGRAM_BOT_TOKEN=токен_нашего_бота
SOURCE_CHANNEL_ID=-1001234567890
ALLOWED_SENDER_BOT_ID=123456789
ALLOWED_SENDER_FALLBACK_TEXT=Fusion AI Agent
SPREADSHEET_NAME=new_marketing
SHEET_NAME=insta
SHEET_RANGE=insta!A:D
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
```

Лучше использовать `SPREADSHEET_ID` из URL таблицы, если он есть. Название `SPREADSHEET_NAME=new_marketing` тоже поддерживается, но при одинаковых названиях файлов бот возьмет первый найденный файл.

4. Создайте Google service account в Google Cloud, скачайте JSON-ключ как `service-account.json`, затем откройте вашу таблицу и дайте доступ email service account с правами редактора.

5. Добавьте нашего Telegram-бота админом в канал, где появляются лиды. Для приватного канала используйте `SOURCE_CHANNEL_ID` вида `-100...`.

6. Запустите:

```bash
npm start
```

## Как работает фильтр по чужому боту

Если Telegram передал `from.id`, бот сверит его с `ALLOWED_SENDER_BOT_ID`.

В каналах Telegram иногда не отдает `from.id` в `channel_post`. Для этого есть запасной фильтр `ALLOWED_SENDER_FALLBACK_TEXT`: бот проверит подпись/текст сообщения, например `Fusion AI Agent`.

Если хотите строго пропускать все сообщения без `from.id`, поставьте:

```env
REQUIRE_SENDER_ID=true
```

## Тест без записи в таблицу

Можно включить режим проверки:

```env
DRY_RUN=true
```

В этом режиме бот парсит сообщения и печатает строку в консоль, но не пишет в Google Sheets. Еще можно отправить пример сообщения боту в личку, и он покажет распарсенную строку.

## Проверка парсера

```bash
npm test
```
