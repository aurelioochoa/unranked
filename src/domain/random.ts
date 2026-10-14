/**
 * Seeded randomness.
 *
 * Every roll in the System is reproducible from a seed: same day, same hunter,
 * same drop. That makes loot and quest selection assertable in tests, and stops
 * a page refresh from re-rolling the day's quests.
 */

export type Rng = () => number

/** mulberry32 — small, fast, good enough for loot tables. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** FNV-1a, so a seed can be a meaningful string like `daily:2026-03-09`. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Weighted choice. Items weighing zero are unreachable, not merely unlikely. */
export function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T | undefined {
  let total = 0
  for (const item of items) {
    const w = weight(item)
    if (w > 0) total += w
  }
  if (total <= 0) return undefined

  let roll = rng() * total
  for (const item of items) {
    const w = weight(item)
    if (w <= 0) continue
    roll -= w
    if (roll < 0) return item
  }
  // Only reachable through floating-point drift on the final item.
  for (let i = items.length - 1; i >= 0; i--) {
    if (weight(items[i]!) > 0) return items[i]
  }
  return undefined
}

/** Fisher-Yates, non-mutating. */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
