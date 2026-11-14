import { Bot } from "grammy";
import type { GameService } from "../services/gameService.js";
import { registerGroupController } from "./controllers/groupController.js";
import { registerOrganizerController } from "./controllers/organizerController.js";
import { registerParticipantController } from "./controllers/participantController.js";
import { registerWishlistController } from "./controllers/wishlistController.js";

export function createBot(token: string, service: GameService): Bot {
  const bot = new Bot(token);

  // В режиме вебхука ошибка привела бы к повторной доставке апдейта, поэтому только логируем.
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
  registerWishlistController(bot, service); // последним: ловит обычные сообщения в личке

  return bot;
}
