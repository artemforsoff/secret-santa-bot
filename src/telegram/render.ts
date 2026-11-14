import { Api, Context, GrammyError } from "grammy";
import { cardMessageIds, type GameService } from "../services/gameService.js";
import { cardKeyboard, cardText } from "./views/card.js";
import { HTML } from "./views/format.js";
import type { Screen } from "./views/organizer.js";

/** Telegram returns an error when an edited message did not change. That is not a failure. */
const notModified = (e: unknown) =>
  e instanceof GrammyError && e.description.includes("not modified");

/** Shows a screen: edits the current message after a button press, otherwise sends a new one. */
export async function show(ctx: Context, screen: Screen): Promise<void> {
  const options = { ...HTML, reply_markup: screen.keyboard };
  if (!ctx.callbackQuery) {
    await ctx.reply(screen.text, options);
    return;
  }
  try {
    await ctx.editMessageText(screen.text, options);
  } catch (e) {
    if (!notModified(e)) throw e;
  }
}

/**
 * Refreshes every game card in the group after the roster changes or the draw happens.
 * There can be several cards: every /santa and /list posts a new one.
 */
export async function refreshCard(
  api: Api,
  botUsername: string,
  service: GameService,
  chatId: number,
): Promise<void> {
  const data = await service.getGameWithParticipants(chatId);
  if (!data) return;
  const text = cardText(data.game, data.participants);
  const options = { ...HTML, reply_markup: cardKeyboard(data.game, botUsername) };
  await Promise.all(
    cardMessageIds(data.game).map(async (messageId) => {
      try {
        await api.editMessageText(chatId, messageId, text, options);
      } catch (e) {
        // The card may have been deleted from the group; the others are still refreshed.
        if (!notModified(e)) console.error(`refreshCard failed for message ${messageId}`, e);
      }
    }),
  );
}
