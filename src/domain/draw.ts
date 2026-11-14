import { randomInt } from "node:crypto";

/**
 * Builds a single gift cycle: everyone gives to the next person around the ring.
 * Nobody gives to themselves or to their partner, and two people never give to each other.
 * Returns null if there are fewer than three participants or no valid arrangement exists.
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
