import { redirect } from 'next/navigation'
import { bootstrap } from '@/server/session'
import { getDb } from '@/db/client'
import { listTemplates } from '@/db/questRepo'
import { HUNTER_ID } from '@/server/session'
import { awakenAction } from '@/app/actions'
import { Awakening, type AwakeningQuest } from '@/ui/Awakening'
import { backgroundOr } from '@/ui/backgrounds/registry'
import { canonicalZone, listTimeZones } from '@/ui/timeZones'
import type { ThemeId } from '@/ui/themeGrounds'
import type { Difficulty } from '@/domain/types'

/**
 * The first run, and the only route outside the System's navigation.
 *
 * Reachable once. Coming back after it is done is a redirect home rather than a
 * second Awakening — the ritual is available again from Settings, which is the
 * place that can also say what replaying it will and will not touch.
 */
export const dynamic = 'force-dynamic'

export default function AwakenPage() {
  const { hunter } = bootstrap()
  if (hunter.onboardedAt !== null) redirect('/')

  const templates = listTemplates(getDb(), HUNTER_ID)
  const quests: AwakeningQuest[] = templates.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    track: t.track,
    baseXp: t.baseXp,
    isCore: t.isCore,
    enabled: t.enabled,
  }))

  const zone = canonicalZone(hunter.timezone)

  return (
    <div className="shell shell--narrow">
      <Awakening
        defaults={{
          // The seeded name is a placeholder, not an answer. Offering it back
          // as prefilled text would get it accepted by default, and the System
          // would spend the next month addressing someone called "Hunter".
          name: hunter.name === 'Hunter' ? '' : hunter.name,
          timezone: zone,
          dailyResetHour: hunter.dailyResetHour,
          difficulty: hunter.difficulty as Difficulty,
          theme: hunter.theme as ThemeId,
          background: backgroundOr(hunter.background),
          rotatingQuestCount: hunter.rotatingQuestCount,
        }}
        zoneGroups={listTimeZones(Date.now(), zone)}
        quests={quests}
        action={awakenAction}
      />
    </div>
  )
}
