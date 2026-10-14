'use client'

import { useTransition } from 'react'
import { TRACK_NAMES, TRACK_STATS, type Track } from '@/domain/types'

export interface TemplateRow {
  readonly id: string
  readonly title: string
  readonly track: Track
  readonly baseXp: number
  readonly isCore: boolean
  readonly enabled: boolean
}

/**
 * Which quests exist at all.
 *
 * Core dailies are issued every day and are the ones the decay rule bites
 * hardest, so keeping that set small matters: a large core set becomes a large
 * set of low-value chores. Everything else rotates, weighted toward whatever
 * has been neglected.
 */
export function QuestSettings({
  templates,
  rotatingCount,
  onToggleEnabled,
  onToggleCore,
}: {
  templates: readonly TemplateRow[]
  rotatingCount: number
  onToggleEnabled: (id: string, enabled: boolean) => Promise<void>
  onToggleCore: (id: string, isCore: boolean) => Promise<void>
}) {
  const [pending, startTransition] = useTransition()

  const core = templates.filter((t) => t.enabled && t.isCore)
  const pool = templates.filter((t) => t.enabled && !t.isCore)

  const byTrack = new Map<Track, TemplateRow[]>()
  for (const t of templates) {
    const list = byTrack.get(t.track) ?? []
    list.push(t)
    byTrack.set(t.track, list)
  }

  return (
    <section className="stack" style={{ gap: 8 }}>
      <div className="between">
        <h2 className="label">Quests</h2>
        <span className="label" style={{ opacity: pending ? 1 : 0.6 }}>
          {core.length} core + {Math.min(rotatingCount, pool.length)} of {pool.length} rotating
        </span>
      </div>

      <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
        Core quests are issued every day, so their value decays fastest — keep that set small.
        The rest rotate, weighted toward whatever you have been avoiding. Disabling a quest stops
        it being issued; its history stays on the record.
      </p>

      {core.length === 0 && (
        <p className="danger-panel" style={{ fontSize: 12 }}>
          No core quests. The System has nothing to hold you to daily.
        </p>
      )}

      {[...byTrack.entries()].map(([track, list]) => (
        <div key={track} className="stack" style={{ gap: 6, marginTop: 4 }}>
          <span className="label">
            {TRACK_NAMES[track]} · {TRACK_STATS[track].join(' ')}
          </span>
          {list.map((t) => (
            <div key={t.id} className="row" style={{ opacity: t.enabled ? 1 : 0.45 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: '1 1 auto' }}>
                <input
                  type="checkbox"
                  checked={t.enabled}
                  onChange={(e) =>
                    startTransition(() => {
                      void onToggleEnabled(t.id, e.target.checked)
                    })
                  }
                  style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }}
                />
                <span style={{ fontSize: 13 }}>{t.title}</span>
              </label>

              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="numeric faint" style={{ fontSize: 10 }}>{t.baseXp} xp</span>
                <button
                  type="button"
                  disabled={!t.enabled}
                  onClick={() =>
                    startTransition(() => {
                      void onToggleCore(t.id, !t.isCore)
                    })
                  }
                  className={t.isCore ? 'chip' : 'chip'}
                  style={{
                    cursor: t.enabled ? 'pointer' : 'not-allowed',
                    background: 'transparent',
                    color: t.isCore ? 'var(--color-accent-bright)' : 'var(--color-ink-faint)',
                    borderColor: t.isCore ? 'var(--color-accent)' : 'var(--color-panel-border-dim)',
                    minHeight: 28,
                  }}
                  aria-pressed={t.isCore}
                  title={t.isCore ? 'Issued every day' : 'Part of the rotation'}
                >
                  {t.isCore ? 'CORE' : 'ROTATES'}
                </button>
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  )
}
