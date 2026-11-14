import type { Bot } from "grammy";
import type { GameService } from "../../services/gameService.js";
import { refreshCard } from "../render.js";
import { parseJoinPayload } from "../views/card.js";
import { HTML, fullName } from "../views/format.js";
import { messages } from "../views/messages.js";

/** Личка участника: запись в игру и свой результат. */
export function registerParticipantController(bot: Bot, service: GameService): void {
  const pm = bot.chatType("private");

  // /start приходит либо сам по себе, либо по кнопке «Участвую» с id беседы.
  pm.command("start", async (ctx) => {
    const chatId = parseJoinPayload(ctx.match);
    if (chatId === undefined) return ctx.reply(messages.help);

    const result = await service.join(chatId, {
      userId: ctx.from.id,
      name: fullName(ctx.from),
      username: ctx.from.username ?? null,
    });
    switch (result.status) {
      case "not_found":
        return ctx.reply(messages.gameNotFound);
      case "closed":
        return ctx.reply(messages.joinClosed(result.game), HTML);
      case "already_joined":
        return ctx.reply(messages.alreadyJoined(ctx.from.first_name, result.game), HTML);
      case "joined":
        await ctx.reply(messages.joined(ctx.from.first_name, result.game), HTML);
        await refreshCard(ctx.api, ctx.me.username, service, chatId);
    }
  });

  pm.command("me", async (ctx) => {
    const results = await service.myResults(ctx.from.id);
    const lines = results.map(({ game, recipient, wishlist }) =>
      recipient ? messages.result(game, recipient, wishlist) : messages.notDrawnYet(game),
    );
    await ctx.reply(lines.length ? lines.join("\n\n") : messages.noGames, HTML);
  });
}
