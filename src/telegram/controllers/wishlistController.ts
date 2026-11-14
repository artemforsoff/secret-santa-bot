import type { Bot, Context } from "grammy";
import type { GameService, SaveWishlistResult } from "../../services/gameService.js";
import { HTML } from "../views/format.js";
import { messages } from "../views/messages.js";

/**
 * Личка: вишлист участника.
 * /wishlist <текст> сохраняет сразу; /wishlist без текста просит прислать его следующим сообщением.
 *
 * Регистрируется последним: обработчик обычных сообщений не должен перехватывать команды
 * других контроллеров.
 */
export function registerWishlistController(bot: Bot, service: GameService): void {
  const pm = bot.chatType("private");

  const replyWithResult = (ctx: Context, result: SaveWishlistResult) =>
    ctx.reply(
      result.status === "saved"
        ? messages.wishlistSaved(result.wishlist)
        : messages.wishlistTooLong(result.max),
      HTML,
    );

  pm.command("wishlist", async (ctx) => {
    const text = ctx.match.trim();
    if (text) return replyWithResult(ctx, await service.saveWishlist(ctx.from.id, text));
    const current = await service.startWishlistEdit(ctx.from.id);
    await ctx.reply(messages.wishlistPrompt(current), HTML);
  });

  // Обычное сообщение — это вишлист, только если человек перед этим вызвал /wishlist.
  pm.on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) return next();
    const result = await service.submitPendingWishlist(ctx.from.id, ctx.message.text);
    if (result.status === "not_pending") return next();
    await replyWithResult(ctx, result);
  });
}
