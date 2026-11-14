import { InlineKeyboard } from "grammy";
import type { Game, Participant } from "../../domain/types.js";
import { esc } from "./format.js";

/** The card message in the group: the participant list and the join button. */
export function cardText(game: Game, participants: Participant[]): string {
  const list = participants.length
    ? participants.map((p, i) => `${i + 1}. ${esc(p.name)}`).join("\n")
    : "пока никого";
  const head = `🎅 <b>Тайный Санта</b>\nОрганизатор: ${esc(game.ownerName)}\n\n`;
  if (game.drawn) {
    return `${head}🎁 Жеребьёвка проведена! Загляните в личку с ботом.\n\nУчастники (${participants.length}):\n${list}`;
  }
  return `${head}Нажми кнопку ниже и запусти бота, чтобы участвовать.\n\nУчаствуют (${participants.length}):\n${list}`;
}

export function cardKeyboard(game: Game, botUsername: string): InlineKeyboard {
  return game.drawn
    ? openBotKeyboard(botUsername)
    : new InlineKeyboard().url("🎁 Участвую", `https://t.me/${botUsername}?start=${joinPayload(game.chatId)}`);
}

export function openBotKeyboard(botUsername: string): InlineKeyboard {
  return new InlineKeyboard().url("Открыть бота", `https://t.me/${botUsername}`);
}

/** The t.me/<bot>?start=… link parameter that joins a participant to the group's game. */
export const joinPayload = (chatId: number) => `j${chatId}`;

export function parseJoinPayload(payload: string): number | undefined {
  const m = /^j(-?\d+)$/.exec(payload.trim());
  return m ? Number(m[1]) : undefined;
}
