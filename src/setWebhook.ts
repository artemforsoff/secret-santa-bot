// One-time setup: points the bot's webhook at the Cloud Run service.
// Usage: BOT_TOKEN=... node dist/setWebhook.js https://<Cloud Run service URL>
import { Api } from "grammy";
import { publishCommands } from "./telegram/commands.js";
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
await publishCommands(api);
console.log(`Webhook set: ${base}/webhook`);
