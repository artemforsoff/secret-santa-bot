import type { Game } from "../../domain/types.js";

export interface JoinInput {
  userId: number;
  name: string;
  username: string | null;
}

export type JoinResult =
  | { status: "not_found" }
  | { status: "joined"; game: Game }
  | { status: "already_joined"; game: Game }
  | { status: "closed"; game: Game };
