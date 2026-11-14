# Secret Santa Bot

Телеграм-бот для Тайного Санты в беседе. TypeScript, grammY, Firestore, Cloud Run.

## Как работает

1. Организатор пишет в беседе `/santa`. Бот постит сообщение с кнопкой «Участвую».
2. Участник жмёт кнопку, попадает в личку с ботом и нажимает Start.
3. Организатор в личке с ботом задаёт пары (`/pair`, `/pairs`), которые не должны выпасть друг другу,
   и при необходимости убирает участников (`/remove`).
4. Организатор в личке пишет `/draw`. Каждый получает в личку имя того, кому дарит.
5. `/me` в личке присылает результат повторно.

Организатор — тот, кто написал `/santa`. Все дарят по одному кольцу, поэтому взаимных пар не бывает.

## Структура кода

```
src/
  index.ts                        — запуск: вебхук на Cloud Run или polling локально
  setWebhook.ts                   — скрипт подключения вебхука и меню команд
  domain/
    types.ts                      — Game, Participant
    draw.ts                       — алгоритм жеребьёвки (одно кольцо)
  repositories/
    gameRepository.ts             — интерфейс хранилища
    firestoreGameRepository.ts    — Firestore
    inMemoryGameRepository.ts     — память, для тестов
  services/
    gameService.ts                — правила игры, без Telegram
  telegram/
    bot.ts                        — сборка бота
    callbackData.ts               — данные инлайн-кнопок
    render.ts                     — показ экранов и обновление карточки в беседе
    controllers/
      groupController.ts          — /santa в беседе
      participantController.ts    — /start, /me
      organizerController.ts      — /pair, /pairs, /draw и их кнопки
    views/                        — тексты и клавиатуры
```

Контроллер разбирает команду или кнопку, вызывает сервис и по его результату выбирает,
что показать. Сервис знает правила игры и ничего не знает про Telegram. Репозиторий только хранит данные.

## Автодеплой

Пуш в `main` запускает [.github/workflows/deploy.yml](.github/workflows/deploy.yml):
тесты, сборка образа, выкладка в Cloud Run. Если тесты падают, деплоя не будет.

GitHub входит в GCP без ключей, через Workload Identity Federation. Параметры лежат
в переменных репозитория: `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`.

Ниже — ручная настройка проекта с нуля.

## Деплой в GCP

Замени `PROJECT_ID` на id своего проекта. Регион в примерах — `europe-west1`.

1. Создай бота в @BotFather и скопируй токен.

2. Авторизуйся и выбери проект:

   ```bash
   gcloud auth login
   ```

   ```bash
   gcloud config set project PROJECT_ID
   ```

3. Включи нужные сервисы:

   ```bash
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com
   ```

4. Создай базу Firestore (один раз на проект):

   ```bash
   gcloud firestore databases create --location=eur3
   ```

5. Положи токен бота в Secret Manager. Команда спросит токен и не сохранит его в истории (PowerShell):

   ```powershell
   Read-Host "Bot token" | gcloud secrets create santa-bot-token --data-file=-
   ```

6. Создай сервисный аккаунт бота и дай ему доступ к базе и секрету:

   ```bash
   gcloud iam service-accounts create santa-bot
   ```

   ```bash
   gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:santa-bot@PROJECT_ID.iam.gserviceaccount.com" --role="roles/datastore.user"
   ```

   ```bash
   gcloud secrets add-iam-policy-binding santa-bot-token --member="serviceAccount:santa-bot@PROJECT_ID.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
   ```

7. Задеплой (из папки проекта):

   ```bash
   gcloud run deploy secret-santa-bot --source . --region europe-west1 --allow-unauthenticated --service-account santa-bot@PROJECT_ID.iam.gserviceaccount.com --set-secrets BOT_TOKEN=santa-bot-token:latest --max-instances 1
   ```

   В конце команда напечатает `Service URL`.

8. Подключи вебхук и меню команд (PowerShell, подставь `Service URL`):

   ```powershell
   $env:BOT_TOKEN = Read-Host "Bot token"; npm run build; npm run webhook -- https://SERVICE_URL
   ```

9. Добавь бота в беседу и напиши `/santa`.

Повторный деплой после изменений — только шаг 7.

## Локальный запуск

Без Cloud Run бот работает через long polling. Нужен доступ к Firestore:

```bash
gcloud auth application-default login
```

```powershell
$env:BOT_TOKEN = Read-Host "Bot token"; $env:GOOGLE_CLOUD_PROJECT = "PROJECT_ID"; npm run dev
```

Локальный запуск снимает вебхук. Чтобы вернуть бота на Cloud Run, повтори шаг 8.

## Тесты

```bash
npm test
```

Проверяют алгоритм жеребьёвки, правила игры в сервисе и сквозной сценарий через контроллеры
(апдейты Telegram подаются напрямую, данные в памяти). Сеть и Firestore для тестов не нужны.

## Данные

Firestore:

- `games/{chatId}` — беседа, организатор, проведена ли жеребьёвка.
- `games/{chatId}/participants/{userId}` — имя, юзернейм, пара, кому дарит.
- `users/{userId}` — в каких беседах человек участвует (для `/me`).

Результат жеребьёвки лежит в базе в открытом виде: у кого есть доступ к проекту GCP, тот может его увидеть.
