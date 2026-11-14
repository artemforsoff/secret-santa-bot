import type { Bot, Context } from "grammy";
import type { Game, Participant } from "../../domain/types.js";
import type { GameService } from "../../services/gameService.js";
import { refreshCard } from "../render.js";
import { cardKeyboard, cardText, openBotKeyboard } from "../views/card.js";
import { HTML, fullName } from "../views/format.js";
import { messages } from "../views/messages.js";

/** Group commands: starting a game and showing the participant list. */
export function registerGroupController(bot: Bot, service: GameService): void {
  const group = bot.chatType(["group", "supergroup"]);

  /**
   * Posts a new card with the list to the group. Earlier cards are not abandoned:
   * the bot remembers all of them and refreshes them together with the new one.
   */
  const postCard = async (ctx: Context, game: Game, participants: Participant[]) => {
    await refreshCard(ctx.api, ctx.me.username, service, game.chatId);
    const card = await ctx.reply(cardText(game, participants), {
      ...HTML,
      reply_markup: cardKeyboard(game, ctx.me.username),
    });
    await service.addCardMessage(game.chatId, card.message_id);
  };

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

    await postCard(ctx, result.game, result.participants);
  });

  // Any group member can request the participant list.
  group.command("list", async (ctx) => {
    const data = await service.getGameWithParticipants(ctx.chat.id);
    if (!data) return ctx.reply(messages.noGameInChat);
    await postCard(ctx, data.game, data.participants);
  });

  // Organizer and participant commands only work in the private chat.
  group.command(["pair", "pairs", "remove", "draw", "me", "wishlist"], (ctx) =>
    ctx.reply(messages.privateOnly, { reply_markup: openBotKeyboard(ctx.me.username) }),
  );
}
