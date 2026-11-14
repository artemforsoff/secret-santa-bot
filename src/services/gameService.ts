import { drawCycle } from "../domain/draw.js";
import type { Game, Participant } from "../domain/types.js";
import type { GameRepository } from "../repositories/gameRepository.js";

export const MIN_PARTICIPANTS = 3;
const MAX_CARDS = 10;
export const MAX_WISHLIST_LENGTH = 1000;
/** Сколько бот ждёт текст вишлиста после /wishlist. */
const WISHLIST_PENDING_TTL_MS = 10 * 60 * 1000;

/** Все сообщения-карточки игры в беседе, от старых к новым. */
export function cardMessageIds(game: Game): number[] {
  return game.messageIds ?? (game.messageId ? [game.messageId] : []);
}

export interface StartGameInput {
  chatId: number;
  title: string;
  userId: number;
  userName: string;
  /** Вызывается, только если нужно решить, может ли не-организатор начать новую игру. */
  isChatAdmin: () => Promise<boolean>;
}

export type StartGameResult =
  | { status: "ok"; game: Game; participants: Participant[] }
  /** Идёт игра другого организатора. */
  | { status: "owned_by_other"; game: Game }
  /** Прошлая игра завершена, но начать новую может только её организатор или админ беседы. */
  | { status: "not_allowed" };

export type JoinResult =
  | { status: "not_found" }
  | { status: "joined"; game: Game }
  | { status: "already_joined"; game: Game }
  | { status: "closed"; game: Game };

export type OrganizerAccess =
  | { status: "forbidden" }
  | { status: "drawn"; game: Game }
  | { status: "ok"; game: Game };

export type Pair = [Participant, Participant];

export interface DrawSummary {
  participants: number;
  pairs: number;
  enoughParticipants: boolean;
}

export interface Assignment {
  giver: Participant;
  recipient: Participant;
  /** Вишлист получателя на момент жеребьёвки. */
  wishlist: string | null;
}

export type SaveWishlistResult =
  | { status: "saved"; wishlist: string }
  | { status: "too_long"; max: number };

export type SubmitWishlistResult = SaveWishlistResult | { status: "not_pending" };

export type DrawFailure = "already_drawn" | "too_few" | "impossible";

export type DrawResult =
  | { status: "failed"; reason: DrawFailure }
  | { status: "ok"; assignments: Assignment[] };

export interface MyResult {
  game: Game;
  /** undefined, пока жеребьёвка не проведена. */
  recipient: Participant | undefined;
  /** Актуальный вишлист получателя. */
  wishlist: string | null;
}

/** Правила игры. Ничего не знает про Telegram и про то, где лежат данные. */
export class GameService {
  constructor(
    private readonly repo: GameRepository,
    private readonly now: () => number = Date.now,
  ) {}

  // ---------- игра в беседе ----------

  /**
   * /santa: начинает новую игру или возвращает текущую.
   * Тот, кто начал игру, становится организатором.
   */
  async startGame(input: StartGameInput): Promise<StartGameResult> {
    let game = await this.repo.getGame(input.chatId);
    if (game && game.ownerId !== input.userId) {
      if (!game.drawn) return { status: "owned_by_other", game };
      if (!(await input.isChatAdmin())) return { status: "not_allowed" };
    }
    if (!game || game.drawn) {
      game = {
        chatId: input.chatId,
        title: input.title,
        ownerId: input.userId,
        ownerName: input.userName,
        messageId: null,
        messageIds: [],
        drawn: false,
      };
      await this.repo.replaceGame(game);
    }
    return { status: "ok", game, participants: await this.repo.getParticipants(input.chatId) };
  }

  /** Запоминает новую карточку игры; помним последние MAX_CARDS. */
  async addCardMessage(chatId: number, messageId: number): Promise<void> {
    await this.repo.transaction(async (tx) => {
      const game = await tx.getGame(chatId);
      if (!game) return;
      const messageIds = [...cardMessageIds(game), messageId].slice(-MAX_CARDS);
      tx.updateGame(chatId, { messageId, messageIds });
    });
  }

  async getGameWithParticipants(
    chatId: number,
  ): Promise<{ game: Game; participants: Participant[] } | undefined> {
    const game = await this.repo.getGame(chatId);
    if (!game) return undefined;
    return { game, participants: await this.repo.getParticipants(chatId) };
  }

  // ---------- участник ----------

  async join(
    chatId: number,
    user: { userId: number; name: string; username: string | null },
  ): Promise<JoinResult> {
    return this.repo.transaction<JoinResult>(async (tx) => {
      const game = await tx.getGame(chatId);
      if (!game) return { status: "not_found" };
      if (await tx.getParticipant(chatId, user.userId)) return { status: "already_joined", game };
      if (game.drawn) return { status: "closed", game };
      tx.addParticipant(chatId, { ...user, partnerId: null, recipientId: null, joinedAt: this.now() });
      return { status: "joined", game };
    });
  }

  /** /me: все игры участника и кому он дарит в каждой. */
  async myResults(userId: number): Promise<MyResult[]> {
    const results: MyResult[] = [];
    for (const chatId of await this.repo.findGameIdsByUser(userId)) {
      const [game, me] = await Promise.all([
        this.repo.getGame(chatId),
        this.repo.getParticipant(chatId, userId),
      ]);
      if (!game || !me) continue;
      const recipient =
        game.drawn && me.recipientId ? await this.repo.getParticipant(chatId, me.recipientId) : undefined;
      const wishlist = recipient ? await this.getWishlist(recipient.userId) : null;
      results.push({ game, recipient, wishlist });
    }
    return results;
  }

  // ---------- вишлист ----------
  // Вишлист один на человека и общий для всех его игр. Видит его только Тайный Санта.

  async getWishlist(userId: number): Promise<string | null> {
    return (await this.repo.getUserProfile(userId)).wishlist;
  }

  /** /wishlist без текста: бот начинает ждать следующее сообщение. Возвращает текущий вишлист. */
  async startWishlistEdit(userId: number): Promise<string | null> {
    const { wishlist } = await this.repo.getUserProfile(userId);
    await this.repo.updateUserProfile(userId, { wishlistPendingAt: this.now() });
    return wishlist;
  }

  /** Сохраняет вишлист, заменяя прежний. */
  async saveWishlist(userId: number, text: string): Promise<SaveWishlistResult> {
    const wishlist = text.trim();
    if (wishlist.length > MAX_WISHLIST_LENGTH) return { status: "too_long", max: MAX_WISHLIST_LENGTH };
    await this.repo.updateUserProfile(userId, { wishlist, wishlistPendingAt: null });
    return { status: "saved", wishlist };
  }

  /** Обычное сообщение в личке: сохраняется как вишлист, только если бот его ждёт. */
  async submitPendingWishlist(userId: number, text: string): Promise<SubmitWishlistResult> {
    const { wishlistPendingAt } = await this.repo.getUserProfile(userId);
    if (!wishlistPendingAt || this.now() - wishlistPendingAt > WISHLIST_PENDING_TTL_MS) {
      return { status: "not_pending" };
    }
    return this.saveWishlist(userId, text);
  }

  // ---------- организатор ----------

  organizerGames(userId: number): Promise<Game[]> {
    return this.repo.findActiveGamesByOwner(userId);
  }

  /** Управлять игрой может только организатор и только до жеребьёвки. */
  async organizerAccess(chatId: number, userId: number): Promise<OrganizerAccess> {
    const game = await this.repo.getGame(chatId);
    if (!game || game.ownerId !== userId) return { status: "forbidden" };
    return { status: game.drawn ? "drawn" : "ok", game };
  }

  participants(chatId: number): Promise<Participant[]> {
    return this.repo.getParticipants(chatId);
  }

  /**
   * Убирает участника из игры до жеребьёвки; его пара, если была, расформировывается.
   * Возвращает убранного участника или undefined, если убирать некого или игра уже разыграна.
   */
  async removeParticipant(chatId: number, userId: number): Promise<Participant | undefined> {
    return this.repo.transaction(async (tx) => {
      const game = await tx.getGame(chatId);
      const participant = await tx.getParticipant(chatId, userId);
      if (!game || game.drawn || !participant) return undefined;
      const partner = participant.partnerId
        ? await tx.getParticipant(chatId, participant.partnerId)
        : undefined;
      if (partner) tx.updateParticipant(chatId, partner.userId, { partnerId: null });
      tx.removeParticipant(chatId, userId);
      return participant;
    });
  }

  /** Участники, у которых ещё нет пары. */
  async freeParticipants(chatId: number): Promise<Participant[]> {
    return (await this.repo.getParticipants(chatId)).filter((p) => !p.partnerId);
  }

  /** Кандидаты в пару для участника; undefined, если он не найден или уже в паре. */
  async pairCandidates(
    chatId: number,
    firstId: number,
  ): Promise<{ first: Participant; candidates: Participant[] } | undefined> {
    const participants = await this.repo.getParticipants(chatId);
    const first = participants.find((p) => p.userId === firstId);
    if (!first || first.partnerId) return undefined;
    return { first, candidates: participants.filter((p) => !p.partnerId && p.userId !== firstId) };
  }

  async listPairs(chatId: number): Promise<Pair[]> {
    const participants = await this.repo.getParticipants(chatId);
    const byId = new Map(participants.map((p) => [p.userId, p]));
    const pairs: Pair[] = [];
    for (const p of participants) {
      const partner = p.partnerId ? byId.get(p.partnerId) : undefined;
      if (partner && p.userId < partner.userId) pairs.push([p, partner]);
    }
    return pairs;
  }

  /** Возвращает false, если кто-то из двоих не участвует или уже в паре. */
  async addPair(chatId: number, firstId: number, secondId: number): Promise<boolean> {
    if (firstId === secondId) return false;
    return this.repo.transaction(async (tx) => {
      const game = await tx.getGame(chatId);
      const first = await tx.getParticipant(chatId, firstId);
      const second = await tx.getParticipant(chatId, secondId);
      if (!game || game.drawn || !first || !second || first.partnerId || second.partnerId) return false;
      tx.updateParticipant(chatId, firstId, { partnerId: secondId });
      tx.updateParticipant(chatId, secondId, { partnerId: firstId });
      return true;
    });
  }

  async removePair(chatId: number, userId: number): Promise<void> {
    await this.repo.transaction(async (tx) => {
      const game = await tx.getGame(chatId);
      const participant = await tx.getParticipant(chatId, userId);
      if (!game || game.drawn || !participant?.partnerId) return;
      tx.updateParticipant(chatId, userId, { partnerId: null });
      tx.updateParticipant(chatId, participant.partnerId, { partnerId: null });
    });
  }

  async drawSummary(chatId: number): Promise<DrawSummary> {
    const participants = await this.repo.getParticipants(chatId);
    return {
      participants: participants.length,
      pairs: participants.filter((p) => p.partnerId).length / 2,
      enoughParticipants: participants.length >= MIN_PARTICIPANTS,
    };
  }

  /** Жеребьёвка проводится ровно один раз: повторный вызов вернёт already_drawn. */
  async draw(chatId: number): Promise<DrawResult> {
    const result = await this.drawInTransaction(chatId);
    if (result.status !== "ok") return result;
    await Promise.all(
      result.assignments.map(async (a) => {
        a.wishlist = await this.getWishlist(a.recipient.userId);
      }),
    );
    return result;
  }

  private drawInTransaction(chatId: number): Promise<DrawResult> {
    return this.repo.transaction<DrawResult>(async (tx) => {
      const game = await tx.getGame(chatId);
      if (!game || game.drawn) return { status: "failed", reason: "already_drawn" };
      const participants = await tx.getParticipants(chatId);
      if (participants.length < MIN_PARTICIPANTS) return { status: "failed", reason: "too_few" };

      const partners = new Map<number, number>();
      for (const p of participants) if (p.partnerId) partners.set(p.userId, p.partnerId);
      const cycle = drawCycle(participants.map((p) => p.userId), partners);
      if (!cycle) return { status: "failed", reason: "impossible" };

      const byId = new Map(participants.map((p) => [p.userId, p]));
      const assignments: Assignment[] = [];
      for (const giver of participants) {
        const recipientId = cycle.get(giver.userId)!;
        tx.updateParticipant(chatId, giver.userId, { recipientId });
        assignments.push({ giver, recipient: byId.get(recipientId)!, wishlist: null });
      }
      tx.updateGame(chatId, { drawn: true });
      return { status: "ok", assignments };
    });
  }
}
