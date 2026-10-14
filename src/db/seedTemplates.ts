import type { Db } from './client'
import { questTemplates } from './schema'
import { STARTER_TEMPLATES } from './starterQuests'
import { eq } from 'drizzle-orm'

/** Install the starter library for a hunter. Idempotent by template id. */
export function seedTemplates(db: Db, hunterId: string, now = Date.now()): number {
  const existing = new Set(
    db
      .select({ id: questTemplates.id })
      .from(questTemplates)
      .where(eq(questTemplates.hunterId, hunterId))
      .all()
      .map((r) => r.id),
  )

  let inserted = 0
  for (const t of STARTER_TEMPLATES) {
    const id = `${hunterId}:${t.key}`
    if (existing.has(id)) continue
    db.insert(questTemplates)
      .values({
        id,
        hunterId,
        title: t.title,
        description: t.description,
        track: t.track,
        tier: t.tier,
        statRewards: t.statRewards,
        baseXp: t.baseXp,
        baseGold: t.baseGold,
        isCore: t.isCore,
        enabled: true,
        createdAt: now,
      })
      .run()
    inserted++
  }
  return inserted
}
