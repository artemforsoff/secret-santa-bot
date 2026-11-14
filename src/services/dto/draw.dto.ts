import type { Participant } from "../../domain/types.js";

/** What the organizer sees before confirming the draw. */
export interface DrawSummary {
  participants: number;
  pairs: number;
  enoughParticipants: boolean;
}

export interface Assignment {
  giver: Participant;
  recipient: Participant;
  /** The recipient's wishlist at the time of the draw. */
  wishlist: string | null;
}

export type DrawFailure = "already_drawn" | "too_few" | "impossible";

export type DrawResult =
  | { status: "failed"; reason: DrawFailure }
  | { status: "ok"; assignments: Assignment[] };
