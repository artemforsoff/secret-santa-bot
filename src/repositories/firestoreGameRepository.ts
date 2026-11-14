import { FieldValue, Firestore } from "@google-cloud/firestore";
import type { Game, Participant } from "../domain/types.js";
import type { GameRepository, GameTransaction } from "./gameRepository.js";

/**
 * Схема:
 *   games/{chatId}                        — Game
 *   games/{chatId}/participants/{userId}  — Participant
 *   users/{userId}                        — { games: chatId[] }
 */
export class FirestoreGameRepository implements GameRepository {
  private readonly db = new Firestore();
  private readonly games = this.db.collection("games");
  private readonly users = this.db.collection("users");

  private gameRef(chatId: number) {
    return this.games.doc(String(chatId));
  }

  private participantsRef(chatId: number) {
    return this.gameRef(chatId).collection("participants");
  }

  private participantRef(chatId: number, userId: number) {
    return this.participantsRef(chatId).doc(String(userId));
  }

  async getGame(chatId: number): Promise<Game | undefined> {
    return (await this.gameRef(chatId).get()).data() as Game | undefined;
  }

  async getParticipant(chatId: number, userId: number): Promise<Participant | undefined> {
    return (await this.participantRef(chatId, userId).get()).data() as Participant | undefined;
  }

  async getParticipants(chatId: number): Promise<Participant[]> {
    const snap = await this.participantsRef(chatId).orderBy("joinedAt").get();
    return snap.docs.map((d) => d.data() as Participant);
  }

  transaction<T>(fn: (tx: GameTransaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction((t) =>
      fn({
        getGame: async (chatId) => (await t.get(this.gameRef(chatId))).data() as Game | undefined,
        getParticipant: async (chatId, userId) =>
          (await t.get(this.participantRef(chatId, userId))).data() as Participant | undefined,
        getParticipants: async (chatId) => {
          const snap = await t.get(this.participantsRef(chatId).orderBy("joinedAt"));
          return snap.docs.map((d) => d.data() as Participant);
        },
        addParticipant: (chatId, participant) => {
          t.set(this.participantRef(chatId, participant.userId), participant);
          t.set(
            this.users.doc(String(participant.userId)),
            { games: FieldValue.arrayUnion(chatId) },
            { merge: true },
          );
        },
        updateParticipant: (chatId, userId, patch) => {
          t.update(this.participantRef(chatId, userId), { ...patch });
        },
        removeParticipant: (chatId, userId) => {
          t.delete(this.participantRef(chatId, userId));
          t.set(
            this.users.doc(String(userId)),
            { games: FieldValue.arrayRemove(chatId) },
            { merge: true },
          );
        },
        updateGame: (chatId, patch) => {
          t.update(this.gameRef(chatId), { ...patch });
        },
      }),
    );
  }

  async replaceGame(game: Game): Promise<void> {
    await this.db.recursiveDelete(this.participantsRef(game.chatId));
    await this.gameRef(game.chatId).set(game);
  }

  async updateGame(chatId: number, patch: Partial<Game>): Promise<void> {
    await this.gameRef(chatId).update({ ...patch });
  }

  async findActiveGamesByOwner(ownerId: number): Promise<Game[]> {
    const snap = await this.games.where("ownerId", "==", ownerId).get();
    return snap.docs.map((d) => d.data() as Game).filter((g) => !g.drawn);
  }

  async findGameIdsByUser(userId: number): Promise<number[]> {
    const data = (await this.users.doc(String(userId)).get()).data();
    return (data?.games as number[] | undefined) ?? [];
  }
}
