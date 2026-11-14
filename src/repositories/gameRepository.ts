import type { Game, Participant, UserProfile } from "../domain/types.js";

/** Reading game data. Available both outside and inside a transaction. */
export interface GameReader {
  getGame(chatId: number): Promise<Game | undefined>;
  getParticipant(chatId: number, userId: number): Promise<Participant | undefined>;
  /** Participants in the order they joined. */
  getParticipants(chatId: number): Promise<Participant[]>;
}

/**
 * Operations inside a transaction.
 * Firestore constraint: all reads first, then writes.
 */
export interface GameTransaction extends GameReader {
  addParticipant(chatId: number, participant: Participant): void;
  updateParticipant(chatId: number, userId: number, patch: Partial<Participant>): void;
  removeParticipant(chatId: number, userId: number): void;
  updateGame(chatId: number, patch: Partial<Game>): void;
}

export interface GameRepository extends GameReader {
  transaction<T>(fn: (tx: GameTransaction) => Promise<T>): Promise<T>;
  /** Creates a game in the group, wiping the previous game's participants. */
  replaceGame(game: Game): Promise<void>;
  updateGame(chatId: number, patch: Partial<Game>): Promise<void>;
  /** The organizer's games that have not been drawn yet. */
  findActiveGamesByOwner(ownerId: number): Promise<Game[]>;
  /** Groups in which the user is a participant. */
  findGameIdsByUser(userId: number): Promise<number[]>;
  getUserProfile(userId: number): Promise<UserProfile>;
  updateUserProfile(userId: number, patch: Partial<UserProfile>): Promise<void>;
}
