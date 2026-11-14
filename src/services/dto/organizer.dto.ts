import type { Game, Participant } from "../../domain/types.js";

/** Whether a user may manage a game: only its organizer, and only before the draw. */
export type OrganizerAccess =
  | { status: "forbidden" }
  | { status: "drawn"; game: Game }
  | { status: "ok"; game: Game };

/** Two participants who must not be drawn for each other. */
export type Pair = [Participant, Participant];

export interface PairCandidates {
  first: Participant;
  candidates: Participant[];
}
