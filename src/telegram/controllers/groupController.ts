import type { Bot } from "grammy";
import type { GameService } from "../../services/gameService.js";
import { cardKeyboard, cardText, openBotKeyboard } from "../views/card.js";
import { HTML, fullName } from "../views/format.js";
import { messages } from "../views/messages.js";

/** Команды в беседе: запуск игры. */
export function registerGroupController(bot: Bot, service: GameService): void {
  const group = bot.chatType(["group", "supergroup"]);

  group.command("santa", async (ctx) => {
    if (ctx.from.is_bot) return ctx.reply(messages.anonymousAdmin);

    const result = await service.startGame({
      chatId: ctx.chat.id,
      title: ctx.chat.title,
      userId: ctx.from.id,
      userName: fullName(ctx.from),
      isChatAdmin: async () => {
        const member = await ctx.getChatMember(ctx.from.id);
        return member.status === "creator" || member.status === "administrator";
      },
    });
    if (result.status === "owned_by_other") return ctx.reply(messages.gameOwnedBy(result.game), HTML);
    if (result.status === "not_allowed") return ctx.reply(messages.restartNotAllowed);

    const card = await ctx.reply(cardText(result.game, result.participants), {
      ...HTML,
      reply_markup: cardKeyboard(result.game, ctx.me.username),
    });
    await service.setCardMessage(ctx.chat.id, card.message_id);
  });

  // Команды организатора и участника работают только в личке.
  group.command(["pair", "pairs", "remove", "draw", "me"], (ctx) =>
    ctx.reply(messages.privateOnly, { reply_markup: openBotKeyboard(ctx.me.username) }),
  );
}
