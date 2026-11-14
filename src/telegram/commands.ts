import type { Api } from "grammy";

/** The command menu shown in group chats. */
export const groupCommands = [
  { command: "santa", description: "Начать Тайного Санту в этой беседе" },
  { command: "list", description: "Показать список участников" },
];

/** The command menu shown in the private chat with the bot. */
export const privateCommands = [
  { command: "me", description: "Кому я дарю подарок и его вишлист" },
  { command: "wishlist", description: "Написать или обновить свой вишлист" },
  { command: "pair", description: "Организатору: задать пару" },
  { command: "pairs", description: "Организатору: список пар" },
  { command: "remove", description: "Организатору: убрать участника" },
  { command: "draw", description: "Организатору: провести жеребьёвку" },
];

/**
 * Publishes the command menu to Telegram. The bot calls this on startup, so the menu
 * follows the deployed code and never needs a manual update.
 */
export async function publishCommands(api: Api): Promise<void> {
  await api.setMyCommands(groupCommands, { scope: { type: "all_group_chats" } });
  await api.setMyCommands(privateCommands, { scope: { type: "all_private_chats" } });
}
