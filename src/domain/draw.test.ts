import assert from "node:assert/strict";
import { test } from "node:test";
import { drawCycle } from "./draw.js";

function pairs(list: [number, number][]): Map<number, number> {
  const m = new Map<number, number>();
  for (const [a, b] of list) {
    m.set(a, b);
    m.set(b, a);
  }
  return m;
}

function assertValid(ids: number[], partner: Map<number, number>, res: Map<number, number>) {
  assert.equal(res.size, ids.length);
  assert.deepEqual([...res.values()].sort((a, b) => a - b), [...ids].sort((a, b) => a - b));
  for (const [giver, receiver] of res) {
    assert.notEqual(giver, receiver, "дарит себе");
    assert.notEqual(partner.get(giver), receiver, "дарит своей паре");
    assert.notEqual(res.get(receiver), giver, "взаимная пара");
  }
  // одно кольцо: обходим всех, начиная с первого
  let cur = ids[0];
  for (let i = 0; i < ids.length; i++) cur = res.get(cur)!;
  assert.equal(cur, ids[0]);
  const seen = new Set<number>();
  for (let i = 0, c = ids[0]; i < ids.length; i++, c = res.get(c)!) seen.add(c);
  assert.equal(seen.size, ids.length, "не одно кольцо");
}

test("меньше трёх участников — нельзя", () => {
  assert.equal(drawCycle([1, 2], new Map()), null);
});

test("трое без пар", () => {
  const ids = [1, 2, 3];
  assertValid(ids, new Map(), drawCycle(ids, new Map())!);
});

test("трое, двое из них пара — невозможно", () => {
  assert.equal(drawCycle([1, 2, 3], pairs([[1, 2]])), null);
});

test("четверо, две пары", () => {
  const ids = [1, 2, 3, 4];
  const p = pairs([[1, 2], [3, 4]]);
  for (let i = 0; i < 200; i++) assertValid(ids, p, drawCycle(ids, p)!);
});

test("50 человек, 25 пар", () => {
  const ids = Array.from({ length: 50 }, (_, i) => i + 1);
  const p = pairs(Array.from({ length: 25 }, (_, i) => [2 * i + 1, 2 * i + 2] as [number, number]));
  for (let i = 0; i < 200; i++) assertValid(ids, p, drawCycle(ids, p)!);
});

test("получатели распределены случайно", () => {
  const ids = [1, 2, 3, 4, 5];
  const got = new Set<number>();
  for (let i = 0; i < 300; i++) got.add(drawCycle(ids, new Map())!.get(1)!);
  assert.deepEqual([...got].sort(), [2, 3, 4, 5]);
});
