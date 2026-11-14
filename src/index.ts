import { createServer } from "node:http";
import { webhookCallback } from "grammy";
import { createBot, webhookSecret } from "./bot.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN is not set");

const bot = createBot(token);

if (process.env.K_SERVICE) {
  // Cloud Run: принимаем апдейты через вебхук.
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
  // Локальный запуск: long polling.
  await bot.api.deleteWebhook();
  console.log("polling…");
  await bot.start();
}
