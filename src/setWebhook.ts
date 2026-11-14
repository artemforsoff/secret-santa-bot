// Использование: BOT_TOKEN=... node dist/setWebhook.js https://<адрес сервиса Cloud Run>
import { Api } from "grammy";
import { webhookSecret } from "./telegram/webhookSecret.js";

const token = process.env.BOT_TOKEN?.trim();
const base = process.argv[2]?.replace(/\/+$/, "");
if (!token || !base) {
  console.error("Нужны переменная BOT_TOKEN и адрес сервиса первым аргументом.");
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
    { command: "me", description: "Кому я дарю подарок" },
    { command: "pair", description: "Организатору: задать пару" },
    { command: "pairs", description: "Организатору: список пар" },
    { command: "remove", description: "Организатору: убрать участника" },
    { command: "draw", description: "Организатору: провести жеребьёвку" },
  ],
  { scope: { type: "all_private_chats" } },
);
console.log(`Вебхук установлен: ${base}/webhook`);
