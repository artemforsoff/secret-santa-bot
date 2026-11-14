# Secret Santa Bot — project conventions

A Telegram bot (grammY, TypeScript) on Cloud Run with Firestore. See [README.md](README.md) for what
it does and how the code is laid out.

## Production is live

- A push to `main` deploys to production. Push only after the owner confirms; commit locally first
  and say what is not deployed yet.
- Every successful deploy becomes a GitHub release (`vMAJOR.MINOR.PATCH`). The patch number grows
  by default; add `[minor]` to the commit message for a new user-facing feature and `[major]` for a
  breaking change. The first line of each commit message ends up in the release notes, so keep it
  meaningful.
- Real games are stored in Firestore. Schema changes must be backward compatible: read old documents
  correctly (see `cardMessageIds` for an example) instead of migrating them by hand.
- Do not print draw results (`recipientId`) when inspecting the database: the organizer plays too.

## Layers

- `telegram/controllers` — parse a command or button press, call the service, pick a view by the
  result's `status`. No game rules here.
- `services/gameService.ts` — all game rules. Knows nothing about Telegram or Firestore.
- `services/dto` — inputs and results of service methods, one file per use case, re-exported from
  `index.ts`. A method reports an expected outcome as `{ status: ... }`, not by throwing.
- `repositories` — storage only. `GameRepository` is the interface; the Firestore and in-memory
  implementations must stay in sync. Inside a transaction do all reads before any write.
- `telegram/views` — every user-facing text and keyboard. Texts live in `messages.ts`.
- `domain` — plain types and the draw algorithm.

## Language

- Comments, README, test names, commit messages: English.
- Everything a bot user sees (messages, buttons, command descriptions): Russian.
- Escape user-provided text with `esc()` before putting it into an HTML message.

## Inline buttons

Callback data codes in `telegram/callbackData.ts` are a public contract: buttons in already sent
messages must keep working. Add new codes, never change or reuse existing ones. Callback data is
limited to 64 bytes.

## Adding a bot command

1. Service method plus its DTO in `services/dto`.
2. Handler in the matching controller (group, participant, organizer, wishlist). The wishlist
   controller is registered last because it catches plain private messages.
3. Texts in `views/messages.ts`, keyboards in `views/`.
4. Entry in `telegram/commands.ts` (the menu is published on startup) and in the help text.
   Private-only commands also go into the redirect list in `groupController.ts`.
5. Tests, then a line in the README.

## Tests

- `npm test` builds and runs everything; it needs no network and no Firestore.
- Each feature gets a service test (`gameService.test.ts`, in-memory repository) and an end-to-end
  scenario through the controllers (`telegram/bot.test.ts`, Bot API calls intercepted).
- The deploy workflow runs the tests first; a failing test blocks the deploy.

## Shell notes (Windows)

- Pass commit messages from a file (`git commit -F`): PowerShell breaks `-m` messages that contain
  double quotes.
- `gcloud` may be missing from PATH in a fresh shell; refresh PATH from the machine and user
  environment before calling it.
