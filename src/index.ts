import { createServer } from "node:http";
import { webhookCallback } from "grammy";
import { FirestoreGameRepository } from "./repositories/firestoreGameRepository.js";
import { GameService } from "./services/gameService.js";
import { createBot } from "./telegram/bot.js";
import { publishCommands } from "./telegram/commands.js";
import { webhookSecret } from "./telegram/webhookSecret.js";

const token = process.env.BOT_TOKEN?.trim();
if (!token) throw new Error("BOT_TOKEN is not set");

const service = new GameService(new FirestoreGameRepository());
const bot = createBot(token, service);

// Keep the command menu in sync with the deployed code. A failure here must not stop the bot.
publishCommands(bot.api).catch((e) => console.error("failed to publish the command menu", e));

if (process.env.K_SERVICE) {
  // Cloud Run: receive updates via webhook.
  const handle = webhookCallback(bot, "http", {
    secretToken: webhookSecret(token),
    timeoutMilliseconds: 55_000,
  });
  const port = Number(process.env.PORT) || 8080;
  createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/webhook") {
      try {
        await handle(req, res);
      } catch (e) {
        console.error("webhook failed", e);
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      }
    } else {
      res.statusCode = 200;
      res.end("ok");
    }
  }).listen(port, () => console.log(`listening on ${port}`));
} else {
  // Local run: long polling.
  await bot.api.deleteWebhook();
  console.log("polling…");
  await bot.start();
}
