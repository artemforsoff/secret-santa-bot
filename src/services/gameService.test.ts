import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryGameRepository } from "../repositories/inMemoryGameRepository.js";
import { GameService, cardMessageIds } from "./gameService.js";

const CHAT = -100;
const OWNER = 1;
const notAdmin = async () => false;
const admin = async () => true;

function setup() {
  const service = new GameService(new InMemoryGameRepository());
  const start = (userId = OWNER, isChatAdmin = notAdmin) =>
    service.startGame({ chatId: CHAT, title: "Беседа", userId, userName: `user${userId}`, isChatAdmin });
  const join = (userId: number) =>
    service.join(CHAT, { userId, name: `user${userId}`, username: null });
  const joinMany = async (...ids: number[]) => {
    for (const id of ids) await join(id);
  };
  return { service, start, join, joinMany };
}

test("whoever starts the game is its organizer", async () => {
  const { service, start } = setup();
  const res = await start();
  assert.equal(res.status, "ok");
  assert.equal((await service.organizerAccess(CHAT, OWNER)).status, "ok");
  assert.equal((await service.organizerAccess(CHAT, 2)).status, "forbidden");
  assert.deepEqual((await service.organizerGames(OWNER)).map((g) => g.chatId), [CHAT]);
});

test("a repeated /santa by the organizer keeps the participants", async () => {
  const { start, joinMany } = setup();
  await start();
  await joinMany(1, 2);
  const res = await start();
  assert.equal(res.status, "ok");
  assert.equal(res.status === "ok" && res.participants.length, 2);
});

test("another user cannot take over a running game", async () => {
  const { start } = setup();
  await start();
  assert.equal((await start(2, admin)).status, "owned_by_other");
});

test("joining: new, repeated, and into a missing game", async () => {
  const { service, start, join } = setup();
  assert.equal((await join(1)).status, "not_found");
  await start();
  assert.equal((await join(1)).status, "joined");
  assert.equal((await join(1)).status, "already_joined");
  assert.equal((await service.getGameWithParticipants(CHAT))!.participants.length, 1);
});

test("pairs: adding, rejecting already paired people, removing", async () => {
  const { service, start, joinMany } = setup();
  await start();
  await joinMany(1, 2, 3, 4);

  assert.equal(await service.addPair(CHAT, 1, 2), true);
  assert.equal(await service.addPair(CHAT, 1, 3), false, "the first one is already paired");
  assert.equal(await service.addPair(CHAT, 3, 3), false, "a pair with oneself");
  assert.equal(await service.addPair(CHAT, 3, 99), false, "not a participant");

  assert.deepEqual((await service.listPairs(CHAT)).map(([a, b]) => [a.userId, b.userId]), [[1, 2]]);
  assert.deepEqual((await service.freeParticipants(CHAT)).map((p) => p.userId), [3, 4]);
  assert.equal(await service.pairCandidates(CHAT, 1), undefined);
  assert.deepEqual((await service.pairCandidates(CHAT, 3))!.candidates.map((p) => p.userId), [4]);
  assert.deepEqual(await service.drawSummary(CHAT), { participants: 4, pairs: 1, enoughParticipants: true });

  await service.removePair(CHAT, 2);
  assert.equal((await service.listPairs(CHAT)).length, 0);
  assert.equal((await service.freeParticipants(CHAT)).length, 4);
});

test("cards: all are remembered, a legacy game with a single messageId is extended", async () => {
  const { service, start } = setup();
  await start();
  assert.deepEqual(cardMessageIds((await service.getGameWithParticipants(CHAT))!.game), []);
  await service.addCardMessage(CHAT, 10);
  await service.addCardMessage(CHAT, 20);
  const game = (await service.getGameWithParticipants(CHAT))!.game;
  assert.equal(game.messageId, 20);
  assert.deepEqual(cardMessageIds(game), [10, 20]);

  // a game created before messageIds existed
  const repo = new InMemoryGameRepository();
  await repo.replaceGame({ chatId: CHAT, title: "t", ownerId: 1, ownerName: "o", messageId: 34, drawn: false });
  const legacy = new GameService(repo);
  await legacy.addCardMessage(CHAT, 82);
  assert.deepEqual(cardMessageIds((await repo.getGame(CHAT))!), [34, 82]);
});

test("wishlist: waiting for the text expires after 10 minutes", async () => {
  let now = 1_000_000;
  const service = new GameService(new InMemoryGameRepository(), () => now);

  assert.deepEqual(await service.submitPendingWishlist(1, "текст"), { status: "not_pending" });
  assert.equal(await service.startWishlistEdit(1), null);
  now += 11 * 60 * 1000;
  assert.deepEqual(await service.submitPendingWishlist(1, "поздно"), { status: "not_pending" });
  assert.equal(await service.getWishlist(1), null);

  await service.startWishlistEdit(1);
  now += 9 * 60 * 1000;
  assert.deepEqual(await service.submitPendingWishlist(1, "  вовремя  "), { status: "saved", wishlist: "вовремя" });
  assert.equal(await service.getWishlist(1), "вовремя");
  assert.equal(await service.startWishlistEdit(1), "вовремя");
});

test("wishlist survives removal from a game and joining again", async () => {
  const { service, start, join, joinMany } = setup();
  await start();
  await joinMany(1, 2, 3);
  await service.saveWishlist(2, "Книга");
  await service.removeParticipant(CHAT, 2);
  await join(2);
  assert.equal(await service.getWishlist(2), "Книга");
});

test("removing a participant: the pair is dissolved and they can join again", async () => {
  const { service, start, join, joinMany } = setup();
  await start();
  await joinMany(1, 2, 3, 4);
  await service.addPair(CHAT, 1, 2);

  const removed = await service.removeParticipant(CHAT, 2);
  assert.equal(removed?.userId, 2);
  assert.deepEqual((await service.participants(CHAT)).map((p) => p.userId), [1, 3, 4]);
  assert.equal((await service.listPairs(CHAT)).length, 0);
  assert.deepEqual((await service.freeParticipants(CHAT)).map((p) => p.userId), [1, 3, 4]);
  assert.deepEqual(await service.myResults(2), []);

  assert.equal(await service.removeParticipant(CHAT, 2), undefined, "already removed");
  assert.equal((await join(2)).status, "joined");
});

test("removing a participant after the draw is not allowed", async () => {
  const { service, start, joinMany } = setup();
  await start();
  await joinMany(1, 2, 3);
  await service.draw(CHAT);
  assert.equal(await service.removeParticipant(CHAT, 2), undefined);
  assert.equal((await service.participants(CHAT)).length, 3);
});

test("draw: fewer than three participants", async () => {
  const { service, start, joinMany } = setup();
  await start();
  await joinMany(1, 2);
  assert.deepEqual(await service.draw(CHAT), { status: "failed", reason: "too_few" });
});

test("draw: an impossible arrangement changes nothing", async () => {
  const { service, start, joinMany } = setup();
  await start();
  await joinMany(1, 2, 3);
  await service.addPair(CHAT, 1, 2);
  assert.deepEqual(await service.draw(CHAT), { status: "failed", reason: "impossible" });
  assert.equal((await service.organizerAccess(CHAT, OWNER)).status, "ok", "the game is not closed");
});

test("draw: a cycle without self or partner, exactly once", async () => {
  const { service, start, join, joinMany } = setup();
  await start();
  await joinMany(1, 2, 3, 4, 5, 6);
  await service.addPair(CHAT, 1, 2);
  await service.addPair(CHAT, 3, 4);

  const res = await service.draw(CHAT);
  assert.equal(res.status, "ok");
  if (res.status !== "ok") return;
  assert.equal(res.assignments.length, 6);
  const next = new Map(res.assignments.map((a) => [a.giver.userId, a.recipient.userId]));
  for (const { giver, recipient } of res.assignments) {
    assert.notEqual(giver.userId, recipient.userId);
    assert.notEqual(giver.partnerId, recipient.userId);
    assert.notEqual(next.get(recipient.userId), giver.userId);
  }
  assert.equal(new Set(next.values()).size, 6, "everyone receives exactly one gift");

  assert.deepEqual(await service.draw(CHAT), { status: "failed", reason: "already_drawn" });
  assert.equal((await service.organizerAccess(CHAT, OWNER)).status, "drawn");
  assert.equal((await join(7)).status, "closed");
  assert.equal(await service.addPair(CHAT, 5, 6), false, "pairs cannot change after the draw");
  assert.deepEqual(await service.organizerGames(OWNER), []);
});

test("/me: nothing before the draw, own recipient after it", async () => {
  const { service, start, joinMany } = setup();
  await start();
  await joinMany(1, 2, 3);
  assert.deepEqual(await service.myResults(99), []);
  assert.equal((await service.myResults(1))[0].recipient, undefined);

  const res = await service.draw(CHAT);
  assert.equal(res.status, "ok");
  if (res.status !== "ok") return;
  const expected = res.assignments.find((a) => a.giver.userId === 1)!.recipient.userId;
  assert.equal((await service.myResults(1))[0].recipient?.userId, expected);
});

test("new game after the draw: organizer or admin only, participants are wiped", async () => {
  const { service, start, joinMany } = setup();
  await start();
  await joinMany(1, 2, 3);
  await service.draw(CHAT);

  assert.equal((await start(2, notAdmin)).status, "not_allowed");
  const res = await start(2, admin);
  assert.equal(res.status, "ok");
  assert.equal(res.status === "ok" && res.participants.length, 0);
  assert.equal((await service.organizerAccess(CHAT, 2)).status, "ok");
  assert.equal((await service.organizerAccess(CHAT, OWNER)).status, "forbidden");
  assert.deepEqual(await service.myResults(1), []);
});
