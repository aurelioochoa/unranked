'use client'

import { useAssistantBinding } from '@/assistant/bindings'
import { useState } from 'react'
import { STATS, STAT_NAMES, type Stat, type StatBlock } from '@/domain/types'

/**
 * Assigning level-up points by hand.
 *
 * Deliberately not automated — choosing where the points go is the most
 * satisfying beat in the source material, and an "auto-assign" button would
 * throw the whole thing away.
 */
export function Allocator({
  unspentPoints,
  stats,
  action,
}: {
  unspentPoints: number
  stats: StatBlock
  action: (formData: FormData) => Promise<void>
}) {
  const [spend, setSpend] = useState<Record<Stat, number>>(
    () => Object.fromEntries(STATS.map((s) => [s, 0])) as Record<Stat, number>,
  )

  useAssistantBinding({ id: 'allocation', read: () => spend, fill: value => setSpend(prev => ({ ...prev, ...value })) })

  const used = STATS.reduce((sum, s) => sum + spend[s], 0)
  const left = unspentPoints - used

  const adjust = (stat: Stat, delta: number) => {
    setSpend((prev) => {
      const next = Math.max(0, prev[stat] + delta)
      const others = STATS.reduce((sum, s) => (s === stat ? sum : sum + prev[s]), 0)
      if (others + next > unspentPoints) return prev
      return { ...prev, [stat]: next }
    })
  }

  return (
    <form action={action} className="panel stack" style={{ gap: 12 }}>
      <div className="between">
        <span style={{ fontSize: 12.5, letterSpacing: '0.12em', color: 'var(--color-accent-bright)' }}>
          {unspentPoints} ABILITY POINT{unspentPoints === 1 ? '' : 'S'} UNSPENT
        </span>
        <span className="numeric" style={{ fontSize: 11, color: 'var(--color-accent)' }}>
          {left} LEFT
        </span>
      </div>

      {STATS.map((stat) => (
        <div key={stat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="numeric muted" style={{ width: 34, fontSize: 11 }}>
            {stat}
          </span>
          <span
            className="numeric"
            style={{ width: 32, fontSize: 17, fontWeight: 700, color: 'var(--color-ink)', textAlign: 'right' }}
          >
            {stats[stat] + spend[stat]}
          </span>
          {spend[stat] > 0 && (
            <span className="numeric" style={{ fontSize: 11, color: 'var(--color-accent)' }}>
              +{spend[stat]}
            </span>
          )}
          <span style={{ flex: '1 1 auto' }} />
          <button
            type="button"
            className="btn btn--ghost"
            style={{ width: 44, minHeight: 40, padding: 0 }}
            onClick={() => adjust(stat, -1)}
            disabled={spend[stat] === 0}
            aria-label={`Remove a point from ${STAT_NAMES[stat]}`}
          >
            −
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ width: 44, minHeight: 40, padding: 0, color: 'var(--color-accent-bright)' }}
            onClick={() => adjust(stat, 1)}
            disabled={left === 0}
            aria-label={`Add a point to ${STAT_NAMES[stat]}`}
          >
            +
          </button>
          <input type="hidden" name={stat} value={spend[stat]} />
        </div>
      ))}

      <button type="submit" className="btn btn--block" disabled={used === 0}>
        Confirm
      </button>
    </form>
  )
}
