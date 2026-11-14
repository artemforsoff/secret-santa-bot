import { FieldValue, Firestore } from "@google-cloud/firestore";
import { drawCycle } from "./draw.js";

export interface Game {
  chatId: number;
  title: string;
  ownerId: number;
  ownerName: string;
  messageId: number | null;
  drawn: boolean;
}

export interface Participant {
  userId: number;
  name: string;
  username: string | null;
  partnerId: number | null;
  recipientId: number | null;
  joinedAt: number;
}

const db = new Firestore();
const games = db.collection("games");
const users = db.collection("users");
const gameRef = (chatId: number) => games.doc(String(chatId));
const partsRef = (chatId: number) => gameRef(chatId).collection("participants");
const partRef = (chatId: number, userId: number) => partsRef(chatId).doc(String(userId));

export async function getGame(chatId: number): Promise<Game | undefined> {
  return (await gameRef(chatId).get()).data() as Game | undefined;
}

/** Создаёт новую игру в беседе, стирая участников предыдущей. */
export async function createGame(game: Game): Promise<void> {
  await db.recursiveDelete(partsRef(game.chatId));
  await gameRef(game.chatId).set(game);
}

export async function setMessageId(chatId: number, messageId: number): Promise<void> {
  await gameRef(chatId).update({ messageId });
}

export async function getParticipants(chatId: number): Promise<Participant[]> {
  const snap = await partsRef(chatId).orderBy("joinedAt").get();
  return snap.docs.map((d) => d.data() as Participant);
}

export async function getParticipant(chatId: number, userId: number): Promise<Participant | undefined> {
  return (await partRef(chatId, userId).get()).data() as Participant | undefined;
}

export async function joinGame(
  chatId: number,
  user: { userId: number; name: string; username: string | null },
): Promise<{ status: "ok" | "exists" | "closed" | "none"; game?: Game }> {
  return db.runTransaction(async (tx) => {
    const game = (await tx.get(gameRef(chatId))).data() as Game | undefined;
    if (!game) return { status: "none" as const };
    const ref = partRef(chatId, user.userId);
    if ((await tx.get(ref)).exists) return { status: "exists" as const, game };
    if (game.drawn) return { status: "closed" as const, game };
    const p: Participant = { ...user, partnerId: null, recipientId: null, joinedAt: Date.now() };
    tx.set(ref, p);
    tx.set(users.doc(String(user.userId)), { games: FieldValue.arrayUnion(chatId) }, { merge: true });
    return { status: "ok" as const, game };
  });
}

/** Беседы, в которых пользователь записан участником. */
export async function userGameIds(userId: number): Promise<number[]> {
  const data = (await users.doc(String(userId)).get()).data();
  return (data?.games as number[] | undefined) ?? [];
}

/** Игры организатора, в которых жеребьёвка ещё не проведена. */
export async function ownerGames(ownerId: number): Promise<Game[]> {
  const snap = await games.where("ownerId", "==", ownerId).get();
  return snap.docs.map((d) => d.data() as Game).filter((g) => !g.drawn);
}

export async function setPair(chatId: number, a: number, b: number): Promise<boolean> {
  if (a === b) return false;
  return db.runTransaction(async (tx) => {
    const game = (await tx.get(gameRef(chatId))).data() as Game | undefined;
    const pa = (await tx.get(partRef(chatId, a))).data() as Participant | undefined;
    const pb = (await tx.get(partRef(chatId, b))).data() as Participant | undefined;
    if (!game || game.drawn || !pa || !pb || pa.partnerId || pb.partnerId) return false;
    tx.update(partRef(chatId, a), { partnerId: b });
    tx.update(partRef(chatId, b), { partnerId: a });
    return true;
  });
}

export async function clearPair(chatId: number, a: number): Promise<void> {
  await db.runTransaction(async (tx) => {
    const game = (await tx.get(gameRef(chatId))).data() as Game | undefined;
    const pa = (await tx.get(partRef(chatId, a))).data() as Participant | undefined;
    if (!game || game.drawn || !pa?.partnerId) return;
    tx.update(partRef(chatId, a), { partnerId: null });
    tx.update(partRef(chatId, pa.partnerId), { partnerId: null });
  });
}

export type DrawResult =
  | { status: "drawn" | "few" | "impossible" }
  | { status: "ok"; participants: Participant[] };

/** Проводит жеребьёвку ровно один раз: повторный вызов вернёт "drawn". */
export async function runDraw(chatId: number): Promise<DrawResult> {
  return db.runTransaction(async (tx) => {
    const game = (await tx.get(gameRef(chatId))).data() as Game | undefined;
    if (!game || game.drawn) return { status: "drawn" as const };
    const snap = await tx.get(partsRef(chatId).orderBy("joinedAt"));
    const parts = snap.docs.map((d) => d.data() as Participant);
    if (parts.length < 3) return { status: "few" as const };
    const partner = new Map<number, number>();
    for (const p of parts) if (p.partnerId) partner.set(p.userId, p.partnerId);
    const result = drawCycle(parts.map((p) => p.userId), partner);
    if (!result) return { status: "impossible" as const };
    for (const p of parts) {
      p.recipientId = result.get(p.userId)!;
      tx.update(partRef(chatId, p.userId), { recipientId: p.recipientId });
    }
    tx.update(gameRef(chatId), { drawn: true });
    return { status: "ok" as const, participants: parts };
  });
}
