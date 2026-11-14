import type { Game, Participant } from "../domain/types.js";

/** Чтение данных игры. Доступно и вне транзакции, и внутри неё. */
export interface GameReader {
  getGame(chatId: number): Promise<Game | undefined>;
  getParticipant(chatId: number, userId: number): Promise<Participant | undefined>;
  /** Участники в порядке записи. */
  getParticipants(chatId: number): Promise<Participant[]>;
}

/**
 * Операции внутри транзакции.
 * Ограничение Firestore: сначала все чтения, потом записи.
 */
export interface GameTransaction extends GameReader {
  addParticipant(chatId: number, participant: Participant): void;
  updateParticipant(chatId: number, userId: number, patch: Partial<Participant>): void;
  removeParticipant(chatId: number, userId: number): void;
  updateGame(chatId: number, patch: Partial<Game>): void;
}

export interface GameRepository extends GameReader {
  transaction<T>(fn: (tx: GameTransaction) => Promise<T>): Promise<T>;
  /** Создаёт игру в беседе, стирая участников предыдущей. */
  replaceGame(game: Game): Promise<void>;
  updateGame(chatId: number, patch: Partial<Game>): Promise<void>;
  /** Игры организатора, в которых жеребьёвка ещё не проведена. */
  findActiveGamesByOwner(ownerId: number): Promise<Game[]>;
  /** Беседы, в которых пользователь записан участником. */
  findGameIdsByUser(userId: number): Promise<number[]>;
}
