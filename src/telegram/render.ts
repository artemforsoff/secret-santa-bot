import { Api, Context, GrammyError } from "grammy";
import { cardMessageIds, type GameService } from "../services/gameService.js";
import { cardKeyboard, cardText } from "./views/card.js";
import { HTML } from "./views/format.js";
import type { Screen } from "./views/organizer.js";

/** Telegram отвечает ошибкой, если отредактированное сообщение не изменилось. Это не сбой. */
const notModified = (e: unknown) =>
  e instanceof GrammyError && e.description.includes("not modified");

/** Показывает экран: после нажатия кнопки меняет текущее сообщение, иначе отправляет новое. */
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
 * Обновляет все карточки игры в беседе после изменения состава или жеребьёвки.
 * Карточек может быть несколько: каждый /santa и /list выкладывает новую.
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
        // Карточку могли удалить из беседы — остальные всё равно обновляем.
        if (!notModified(e)) console.error(`refreshCard failed for message ${messageId}`, e);
      }
    }),
  );
}
