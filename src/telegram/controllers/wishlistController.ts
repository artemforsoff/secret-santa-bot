import type { Bot, Context } from "grammy";
import type { GameService, SaveWishlistResult } from "../../services/gameService.js";
import { HTML } from "../views/format.js";
import { messages } from "../views/messages.js";

/**
 * Private chat: the participant's wishlist.
 * /wishlist <text> saves right away; /wishlist without text asks for it in the next message.
 *
 * Registered last: the plain-message handler must not intercept commands
 * of other controllers.
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

  // A plain message is a wishlist only if the user ran /wishlist just before.
  pm.on("message:text", async (ctx, next) => {
    if (ctx.message.text.startsWith("/")) return next();
    const result = await service.submitPendingWishlist(ctx.from.id, ctx.message.text);
    if (result.status === "not_pending") return next();
    await replyWithResult(ctx, result);
  });
}
