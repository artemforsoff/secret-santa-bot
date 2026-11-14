import type { Game, Participant } from "../../domain/types.js";

/** One line of /me: a game the user takes part in and who they give to in it. */
export interface MyResult {
  game: Game;
  /** undefined until the draw has happened. */
  recipient: Participant | undefined;
  /** The recipient's current wishlist. */
  wishlist: string | null;
}
