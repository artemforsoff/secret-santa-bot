import type { Participant } from "../../domain/types.js";

/** Все сообщения бота отправляются в HTML-разметке. */
export const HTML = { parse_mode: "HTML" as const };

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const fullName = (u: { first_name: string; last_name?: string }) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ");

/** Имя с юзернеймом: чтобы различать тёзок. */
export const label = (p: Participant) => p.name + (p.username ? ` (@${p.username})` : "");
