import type { Game, Participant } from "../../domain/types.js";

export interface StartGameInput {
  chatId: number;
  title: string;
  userId: number;
  userName: string;
  /** Called only when deciding whether a non-organizer may start a new game. */
  isChatAdmin: () => Promise<boolean>;
}

export type StartGameResult =
  | { status: "ok"; game: Game; participants: Participant[] }
  /** Another organizer's game is in progress. */
  | { status: "owned_by_other"; game: Game }
  /** The previous game is over, but only its organizer or a chat admin may start a new one. */
  | { status: "not_allowed" };
