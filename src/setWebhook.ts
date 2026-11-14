// Usage: BOT_TOKEN=... node dist/setWebhook.js https://<Cloud Run service URL>
import { Api } from "grammy";
import { webhookSecret } from "./telegram/webhookSecret.js";

const token = process.env.BOT_TOKEN?.trim();
const base = process.argv[2]?.replace(/\/+$/, "");
if (!token || !base) {
  console.error("BOT_TOKEN and the service URL (first argument) are required.");
  process.exit(1);
}

const api = new Api(token);
await api.setWebhook(`${base}/webhook`, {
  secret_token: webhookSecret(token),
  allowed_updates: ["message", "callback_query"],
});
await api.setMyCommands(
  [
    { command: "santa", description: "Начать Тайного Санту в этой беседе" },
    { command: "list", description: "Показать список участников" },
  ],
  { scope: { type: "all_group_chats" } },
);
await api.setMyCommands(
  [
    { command: "me", description: "Кому я дарю подарок и его вишлист" },
    { command: "wishlist", description: "Написать или обновить свой вишлист" },
    { command: "pair", description: "Организатору: задать пару" },
    { command: "pairs", description: "Организатору: список пар" },
    { command: "remove", description: "Организатору: убрать участника" },
    { command: "draw", description: "Организатору: провести жеребьёвку" },
  ],
  { scope: { type: "all_private_chats" } },
);
console.log(`Webhook set: ${base}/webhook`);
