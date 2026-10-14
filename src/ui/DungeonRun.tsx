'use client'

import { useEffect, useState } from 'react'
import { GRACE_MS } from '@/domain/dungeon'
import type { Track } from '@/domain/types'

/**
 * The sealed instance.
 *
 * Clear is not offered until the time has actually been served. The countdown
 * here is cosmetic — the server recomputes elapsed time from the persisted
 * start on every action, so a fiddled clock or a reloaded tab changes nothing
 * about what this run is worth.
 */
export function DungeonRun({
  runId,
  objective,
  track,
  startedAt,
  plannedMs,
  clearAction,
  fleeAction,
}: {
  runId: string
  objective: string
  track: Track
  startedAt: number
  plannedMs: number
  clearAction: (runId: string) => Promise<void>
  fleeAction: (runId: string) => Promise<void>
}) {
  const endsAt = startedAt + plannedMs
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const remaining = now === null ? plannedMs : Math.max(0, endsAt - now)
  const served = now === null ? 0 : Math.min(plannedMs, Math.max(0, now - startedAt))
  const fraction = plannedMs === 0 ? 1 : served / plannedMs
  const clearable = remaining === 0
  const expiring = now !== null && now > endsAt + GRACE_MS - 10 * 60_000

  const clock = (ms: number) => {
    const total = Math.floor(ms / 1000)
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }
  const remainingClock = clock(remaining)
  // Once the time is served the label changes to "Time served", so the figure
  // under it has to change too. It used to keep showing the remaining time,
  // which by then was always 00:00 — a screen that read "TIME SERVED 00:00"
  // after a full fifty-minute session.
  const servedClock = clock(served)

  const R = 110
  const C = 2 * Math.PI * R

  return (
    <>
      <header className="dungeon-view" style={{ padding: '22px 16px 0', textAlign: 'center' }}>
        <h1 className="system-title" style={{ fontSize: 11 }}>
          Instant Dungeon
        </h1>
      </header>

      <main className="stack dungeon-view" style={{ alignItems: 'center', gap: 0 }}>
        <span className="label" style={{ marginTop: 26 }}>
          Objective
        </span>
        <p
          style={{
            margin: '9px 24px 0',
            textAlign: 'center',
            fontFamily: 'var(--font-display-theme)',
            fontSize: 19,
            fontWeight: 600,
            lineHeight: 1.35,
            color: 'var(--color-ink)',
          }}
        >
          {objective}
        </p>

        <div style={{ position: 'relative', width: 244, height: 244, marginTop: 32 }}>
          <svg
            width="244"
            height="244"
            viewBox="0 0 244 244"
            style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
            aria-hidden="true"
          >
            <circle
              cx="122" cy="122" r={R} fill="none" strokeWidth="2"
              stroke="color-mix(in srgb, var(--color-accent) 13%, transparent)"
            />
            <circle
              cx="122" cy="122" r={R} fill="none" strokeWidth="3" strokeLinecap="round"
              stroke="var(--color-accent)"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - fraction)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
            }}
          >
            <span className="label">{clearable ? 'Time served' : 'Remaining'}</span>
            <span
              className="numeric"
              style={{ fontSize: 50, fontWeight: 700, lineHeight: 1, color: 'var(--color-ink)' }}
              suppressHydrationWarning
            >
              {clearable ? servedClock : remainingClock}
            </span>
            <span className="label">
              of {Math.round(plannedMs / 60_000)}:00 · {track}
            </span>
          </div>
        </div>

        <p className="faint" style={{ margin: '28px 24px 0', textAlign: 'center', fontSize: 12, lineHeight: 1.6 }}>
          Time is measured by the System, not by this screen.
          <br />
          Closing the tab changes nothing.
        </p>

        {expiring && (
          <p className="danger-panel" style={{ margin: '16px 0 0', fontSize: 12 }}>
            This run expires soon. An unclosed dungeon pays a quarter — the System cannot verify
            what it did not see.
          </p>
        )}

        <div style={{ flex: '1 1 auto', minHeight: 24 }} />

        <div className="stack" style={{ gap: 10, width: '100%', paddingBottom: 12 }}>
          <form action={clearAction.bind(null, runId)}>
            <button type="submit" className="btn btn--block" disabled={!clearable}>
              {clearable ? 'Clear' : `Clear — locked for ${remainingClock}`}
            </button>
          </form>
          <form action={fleeAction.bind(null, runId)}>
            <button type="submit" className="btn btn--danger btn--block">
              Flee
            </button>
          </form>
          <p className="faint" style={{ margin: 0, textAlign: 'center', fontSize: 11 }}>
            Fleeing pays 40% of the time served, and drops nothing.
          </p>
        </div>
      </main>
    </>
  )
}
