# Secret Santa Bot

A Telegram bot that runs Secret Santa in a group chat. TypeScript, grammY, Firestore, Cloud Run.

The bot's interface is in Russian.

## How it works

1. The organizer sends `/santa` in the group. The bot posts a message with a join button.
2. A participant presses the button, lands in the private chat with the bot and presses Start.
3. In the private chat the organizer sets pairs that must not be drawn for each other (`/pair`, `/pairs`)
   and removes participants if needed (`/remove`).
4. The organizer sends `/draw` in the private chat. Everyone receives the name of the person they give a gift to.
5. `/me` in the private chat sends the result again, together with the recipient's wishlist.

The organizer is whoever sent `/santa`. Everyone gives along a single cycle, so two people never
draw each other.

`/wishlist` in the private chat: a participant writes what they would like to get. Only their Secret
Santa sees the text, in the draw message and in `/me`. A repeated `/wishlist` replaces the text.
There is one wishlist per user, shared across all their games.

`/list` in the group posts the current participant list. The bot remembers all of its list messages
(the last 10) and refreshes each of them, so a pinned message never goes stale.

The bot works in any number of groups; each group has its own independent game.

## Code structure

```
src/
  index.ts                        — entry point: webhook on Cloud Run, polling locally
  setWebhook.ts                   — one-time script that sets the webhook
  domain/
    types.ts                      — Game, Participant, UserProfile
    draw.ts                       — the draw algorithm (a single cycle)
  repositories/
    gameRepository.ts             — storage interface
    firestoreGameRepository.ts    — Firestore
    inMemoryGameRepository.ts     — in memory, for tests
  services/
    gameService.ts                — game rules, no Telegram
    dto/                          — inputs and results of the service methods
  telegram/
    bot.ts                        — bot assembly
    callbackData.ts               — inline button data
    commands.ts                   — the command menu, published on startup
    render.ts                     — showing screens and refreshing the group cards
    controllers/
      groupController.ts          — /santa and /list in the group
      participantController.ts    — /start, /me
      organizerController.ts      — /pair, /pairs, /remove, /draw and their buttons
      wishlistController.ts       — /wishlist
    views/                        — texts and keyboards
```

A controller parses a command or a button press, calls the service and picks what to show based on
the result. The service knows the game rules and nothing about Telegram. The repository only stores data.

## Deployment

Push to `main`. The [deploy workflow](.github/workflows/deploy.yml) runs the tests, builds the image
and rolls it out to Cloud Run; see the workflow for details. If the tests fail, nothing is deployed.

Every successful deploy is published as a GitHub release with the next version number. By default
the patch number grows (`v1.0.3` → `v1.0.4`). Put `[minor]` or `[major]` into the commit message to
bump that part instead. The release notes list the commits since the previous release.

The bot publishes its command menu to Telegram on startup, so the menu follows the deployed code.

The webhook is set once per service URL:

```powershell
$env:BOT_TOKEN = Read-Host "Bot token"; npm run build; npm run webhook -- https://SERVICE_URL
```

## Running locally

Outside Cloud Run the bot uses long polling. It needs access to Firestore:

```bash
gcloud auth application-default login
```

```powershell
$env:BOT_TOKEN = Read-Host "Bot token"; $env:GOOGLE_CLOUD_PROJECT = "PROJECT_ID"; npm run dev
```

A local run removes the webhook. To move the bot back to Cloud Run, run the `webhook` command above.

## Tests

```bash
npm test
```

The tests cover the draw algorithm, the game rules in the service and end-to-end scenarios through
the controllers (Telegram updates are fed in directly, data lives in memory). They need neither
network access nor Firestore.

## Data

Firestore:

- `games/{chatId}` — the group, the organizer, the card message ids, whether the draw has happened.
- `games/{chatId}/participants/{userId}` — name, username, partner, gift recipient.
- `users/{userId}` — which groups the user takes part in (for `/me`) and their wishlist.

The draw result is stored in plain form: anyone with access to the GCP project can see it.
