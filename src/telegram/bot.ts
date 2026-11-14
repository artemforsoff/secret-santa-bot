import { Bot } from "grammy";
import type { GameService } from "../services/gameService.js";
import { registerGroupController } from "./controllers/groupController.js";
import { registerOrganizerController } from "./controllers/organizerController.js";
import { registerParticipantController } from "./controllers/participantController.js";
import { registerWishlistController } from "./controllers/wishlistController.js";

export function createBot(token: string, service: GameService): Bot {
  const bot = new Bot(token);

  // In webhook mode a thrown error would make Telegram redeliver the update, so we only log it.
  bot.use(async (_ctx, next) => {
    try {
      await next();
    } catch (e) {
      console.error("update failed", e);
    }
  });

  registerGroupController(bot, service);
  registerParticipantController(bot, service);
  registerOrganizerController(bot, service);
  registerWishlistController(bot, service); // last: it catches plain private messages

  return bot;
}
