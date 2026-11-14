import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryGameRepository } from "../repositories/inMemoryGameRepository.js";
import { GameService } from "./gameService.js";

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

test("кто начал игру, тот организатор", async () => {
  const { service, start } = setup();
  const res = await start();
  assert.equal(res.status, "ok");
  assert.equal((await service.organizerAccess(CHAT, OWNER)).status, "ok");
  assert.equal((await service.organizerAccess(CHAT, 2)).status, "forbidden");
  assert.deepEqual((await service.organizerGames(OWNER)).map((g) => g.chatId), [CHAT]);
});

test("повторный /santa организатора не сбрасывает участников", async () => {
  const { start, joinMany } = setup();
  await start();
  await joinMany(1, 2);
  const res = await start();
  assert.equal(res.status, "ok");
  assert.equal(res.status === "ok" && res.participants.length, 2);
});

test("другой человек не может перехватить идущую игру", async () => {
  const { start } = setup();
  await start();
  assert.equal((await start(2, admin)).status, "owned_by_other");
});

test("запись: новая, повторная, в несуществующую игру", async () => {
  const { service, start, join } = setup();
  assert.equal((await join(1)).status, "not_found");
  await start();
  assert.equal((await join(1)).status, "joined");
  assert.equal((await join(1)).status, "already_joined");
  assert.equal((await service.getGameWithParticipants(CHAT))!.participants.length, 1);
});

test("пары: добавление, отказ для занятых, удаление", async () => {
  const { service, start, joinMany } = setup();
  await start();
  await joinMany(1, 2, 3, 4);

  assert.equal(await service.addPair(CHAT, 1, 2), true);
  assert.equal(await service.addPair(CHAT, 1, 3), false, "первый уже в паре");
  assert.equal(await service.addPair(CHAT, 3, 3), false, "пара с самим собой");
  assert.equal(await service.addPair(CHAT, 3, 99), false, "не участник");

  assert.deepEqual((await service.listPairs(CHAT)).map(([a, b]) => [a.userId, b.userId]), [[1, 2]]);
  assert.deepEqual((await service.freeParticipants(CHAT)).map((p) => p.userId), [3, 4]);
  assert.equal(await service.pairCandidates(CHAT, 1), undefined);
  assert.deepEqual((await service.pairCandidates(CHAT, 3))!.candidates.map((p) => p.userId), [4]);
  assert.deepEqual(await service.drawSummary(CHAT), { participants: 4, pairs: 1, enoughParticipants: true });

  await service.removePair(CHAT, 2);
  assert.equal((await service.listPairs(CHAT)).length, 0);
  assert.equal((await service.freeParticipants(CHAT)).length, 4);
});

test("жеребьёвка: меньше трёх участников", async () => {
  const { service, start, joinMany } = setup();
  await start();
  await joinMany(1, 2);
  assert.deepEqual(await service.draw(CHAT), { status: "failed", reason: "too_few" });
});

test("жеребьёвка: невозможный расклад ничего не меняет", async () => {
  const { service, start, joinMany } = setup();
  await start();
  await joinMany(1, 2, 3);
  await service.addPair(CHAT, 1, 2);
  assert.deepEqual(await service.draw(CHAT), { status: "failed", reason: "impossible" });
  assert.equal((await service.organizerAccess(CHAT, OWNER)).status, "ok", "игра не закрыта");
});

test("жеребьёвка: кольцо без себя и без своей пары, только один раз", async () => {
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
  assert.equal(new Set(next.values()).size, 6, "каждый получает ровно один подарок");

  assert.deepEqual(await service.draw(CHAT), { status: "failed", reason: "already_drawn" });
  assert.equal((await service.organizerAccess(CHAT, OWNER)).status, "drawn");
  assert.equal((await join(7)).status, "closed");
  assert.equal(await service.addPair(CHAT, 5, 6), false, "пары после жеребьёвки не меняются");
  assert.deepEqual(await service.organizerGames(OWNER), []);
});

test("/me: до жеребьёвки пусто, после — свой получатель", async () => {
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

test("новая игра после жеребьёвки: организатор или админ, участники стираются", async () => {
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
