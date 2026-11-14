import { randomInt } from "node:crypto";

/**
 * Строит одно кольцо дарения: каждый дарит следующему по кругу.
 * Никто не дарит себе и своей паре, взаимных «я тебе, ты мне» не бывает.
 * Возвращает null, если участников меньше трёх или расклад невозможен.
 */
export function drawCycle(
  ids: number[],
  partner: Map<number, number>,
): Map<number, number> | null {
  const n = ids.length;
  if (n < 3) return null;
  const order = [...ids];
  for (let attempt = 0; attempt < 20000; attempt++) {
    for (let i = n - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const ok = order.every((id, i) => partner.get(id) !== order[(i + 1) % n]);
    if (ok) return new Map(order.map((id, i) => [id, order[(i + 1) % n]]));
  }
  return null;
}
