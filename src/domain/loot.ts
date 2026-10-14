/**
 * Loot.
 *
 * Drops are seeded, so the same run always yields the same item: testable, and
 * immune to refresh-until-you-like-it. Every item does something mechanical —
 * a self-improvement app has no use for cosmetic junk, and an item that only
 * says "nice job" is the kind of ceremony that kills this genre.
 *
 * Two items are the interesting ones: a Penalty Waiver is the escape hatch that
 * makes "recoverable" real, and a Decay Reset makes a stale quest pay full rate
 * again — the only way to buy your way out of the anti-plateau rule, and it has
 * to be earned.
 */

import { hashSeed, makeRng, pickWeighted } from './random'
import type { Rarity } from './types'

export type LootEffect =
  | 'XP_BONUS'
  | 'GOLD'
  | 'EXCELIA_SHARD'
  | 'PENALTY_WAIVER'
  | 'DECAY_RESET'

export interface LootItem {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly rarity: Rarity
  readonly effect: LootEffect
  /** Size of the effect. Zero for effects that are inherently one-shot. */
  readonly magnitude: number
}

export const RARITY_WEIGHTS: Readonly<Record<Rarity, number>> = Object.freeze({
  COMMON: 60,
  UNCOMMON: 25,
  RARE: 10,
  EPIC: 4,
  LEGENDARY: 1,
})

export const LOOT_TABLE: readonly LootItem[] = Object.freeze([
  {
    id: 'lesser-mana-crystal',
    name: 'Lesser Mana Crystal',
    description: 'A dull shard, still warm. Worth something to the right buyer.',
    rarity: 'COMMON',
    effect: 'GOLD',
    magnitude: 25,
  },
  {
    id: 'scrap-of-insight',
    name: 'Scrap of Insight',
    description: 'A half-formed thought, made solid. It knows a little more than you did.',
    rarity: 'COMMON',
    effect: 'XP_BONUS',
    magnitude: 40,
  },
  {
    id: 'iron-resolve-shard',
    name: 'Shard of Iron Resolve',
    description: 'Cold to the touch. Sharpens whichever discipline you press it into.',
    rarity: 'UNCOMMON',
    effect: 'EXCELIA_SHARD',
    magnitude: 60,
  },
  {
    id: 'greater-mana-crystal',
    name: 'Greater Mana Crystal',
    description: 'Heavy, clear, and quietly humming.',
    rarity: 'UNCOMMON',
    effect: 'GOLD',
    magnitude: 120,
  },
  {
    id: 'tome-of-the-diligent',
    name: 'Tome of the Diligent',
    description: 'Someone else already did the hard part. This time.',
    rarity: 'RARE',
    effect: 'XP_BONUS',
    magnitude: 400,
  },
  {
    id: 'stone-of-atonement',
    name: 'Stone of Atonement',
    description: 'The System looks away, once. One outstanding penalty is struck from the record.',
    rarity: 'EPIC',
    effect: 'PENALTY_WAIVER',
    magnitude: 0,
  },
  {
    id: 'first-dawn-elixir',
    name: 'Elixir of the First Dawn',
    description:
      'Drink, and one familiar task is strange again — its decayed value restored to full.',
    rarity: 'LEGENDARY',
    effect: 'DECAY_RESET',
    magnitude: 0,
  },
])

const byId = new Map(LOOT_TABLE.map((i) => [i.id, i]))

export function lootById(id: string): LootItem | undefined {
  return byId.get(id)
}

/** Roll `rolls` items from the table. Deterministic in `seed`. */
export function rollLoot(seed: string, rolls: number): LootItem[] {
  const count = Math.max(0, Math.trunc(rolls))
  if (count === 0) return []

  const rng = makeRng(hashSeed(`loot:${seed}`))
  const out: LootItem[] = []
  for (let i = 0; i < count; i++) {
    const picked = pickWeighted(LOOT_TABLE, (item) => RARITY_WEIGHTS[item.rarity], rng)
    if (picked) out.push(picked)
  }
  return out
}
