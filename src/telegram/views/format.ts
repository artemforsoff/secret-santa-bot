import type { Participant } from "../../domain/types.js";

/** All bot messages are sent with HTML markup. */
export const HTML = { parse_mode: "HTML" as const };

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const fullName = (u: { first_name: string; last_name?: string }) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ");

/** Name with username, to tell namesakes apart. */
export const label = (p: Participant) => p.name + (p.username ? ` (@${p.username})` : "");
