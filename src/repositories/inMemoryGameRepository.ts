import type { Game, Participant, UserProfile } from "../domain/types.js";
import type { GameRepository, GameTransaction } from "./gameRepository.js";

/** In-memory repository: for testing the service without Firestore. */
export class InMemoryGameRepository implements GameRepository {
  private readonly games = new Map<number, Game>();
  private readonly participants = new Map<number, Map<number, Participant>>();
  private readonly userGames = new Map<number, Set<number>>();
  private readonly profiles = new Map<number, Partial<UserProfile>>();

  private partsOf(chatId: number): Map<number, Participant> {
    let parts = this.participants.get(chatId);
    if (!parts) this.participants.set(chatId, (parts = new Map()));
    return parts;
  }

  async getGame(chatId: number): Promise<Game | undefined> {
    const game = this.games.get(chatId);
    return game && { ...game };
  }

  async getParticipant(chatId: number, userId: number): Promise<Participant | undefined> {
    const p = this.partsOf(chatId).get(userId);
    return p && { ...p };
  }

  async getParticipants(chatId: number): Promise<Participant[]> {
    return [...this.partsOf(chatId).values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ ...p }));
  }

  async transaction<T>(fn: (tx: GameTransaction) => Promise<T>): Promise<T> {
    return fn({
      getGame: (chatId) => this.getGame(chatId),
      getParticipant: (chatId, userId) => this.getParticipant(chatId, userId),
      getParticipants: (chatId) => this.getParticipants(chatId),
      addParticipant: (chatId, participant) => {
        this.partsOf(chatId).set(participant.userId, { ...participant });
        const set = this.userGames.get(participant.userId) ?? new Set<number>();
        set.add(chatId);
        this.userGames.set(participant.userId, set);
      },
      updateParticipant: (chatId, userId, patch) => {
        const p = this.partsOf(chatId).get(userId);
        if (p) Object.assign(p, patch);
      },
      removeParticipant: (chatId, userId) => {
        this.partsOf(chatId).delete(userId);
        this.userGames.get(userId)?.delete(chatId);
      },
      updateGame: (chatId, patch) => {
        const game = this.games.get(chatId);
        if (game) Object.assign(game, patch);
      },
    });
  }

  async replaceGame(game: Game): Promise<void> {
    this.participants.delete(game.chatId);
    this.games.set(game.chatId, { ...game });
  }

  async updateGame(chatId: number, patch: Partial<Game>): Promise<void> {
    const game = this.games.get(chatId);
    if (game) Object.assign(game, patch);
  }

  async findActiveGamesByOwner(ownerId: number): Promise<Game[]> {
    return [...this.games.values()].filter((g) => g.ownerId === ownerId && !g.drawn).map((g) => ({ ...g }));
  }

  async findGameIdsByUser(userId: number): Promise<number[]> {
    return [...(this.userGames.get(userId) ?? [])];
  }

  async getUserProfile(userId: number): Promise<UserProfile> {
    return { wishlist: null, wishlistPendingAt: null, ...this.profiles.get(userId) };
  }

  async updateUserProfile(userId: number, patch: Partial<UserProfile>): Promise<void> {
    this.profiles.set(userId, { ...this.profiles.get(userId), ...patch });
  }
}
