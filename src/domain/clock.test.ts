import { describe, it, expect } from 'vitest'
import { FixedClock, systemClock, tzOffsetMs, zonedTimeToUtc, nextResetAfter, previousResetBefore, localDayKey } from './clock'

const H = 3_600_000

describe('FixedClock', () => {
  it('reports the time it was given and advances on demand', () => {
    const c = new FixedClock(1_000)
    expect(c.now()).toBe(1_000)
    c.advance(500)
    expect(c.now()).toBe(1_500)
    c.set(9_000)
    expect(c.now()).toBe(9_000)
  })

  it('refuses to travel backwards via advance', () => {
    const c = new FixedClock(1_000)
    expect(() => c.advance(-1)).toThrow(/backwards/i)
  })
})

describe('systemClock', () => {
  it('is close to Date.now', () => {
    expect(Math.abs(systemClock.now() - Date.now())).toBeLessThan(1_000)
  })
})

describe('tzOffsetMs', () => {
  it('is zero for UTC', () => {
    expect(tzOffsetMs(Date.UTC(2026, 0, 15), 'UTC')).toBe(0)
  })

  it('tracks DST for a northern-hemisphere zone', () => {
    // Madrid: UTC+1 in January, UTC+2 in July.
    expect(tzOffsetMs(Date.UTC(2026, 0, 15, 12), 'Europe/Madrid')).toBe(1 * H)
    expect(tzOffsetMs(Date.UTC(2026, 6, 15, 12), 'Europe/Madrid')).toBe(2 * H)
  })

  it('handles negative offsets', () => {
    expect(tzOffsetMs(Date.UTC(2026, 0, 15, 12), 'America/New_York')).toBe(-5 * H)
  })
})

describe('zonedTimeToUtc', () => {
  it('resolves a wall-clock time in a zone to the right instant', () => {
    // 04:00 in Madrid on 15 Jan 2026 (UTC+1) is 03:00 UTC.
    expect(zonedTimeToUtc(2026, 1, 15, 4, 'Europe/Madrid')).toBe(Date.UTC(2026, 0, 15, 3))
    // 04:00 in Madrid on 15 Jul 2026 (UTC+2) is 02:00 UTC.
    expect(zonedTimeToUtc(2026, 7, 15, 4, 'Europe/Madrid')).toBe(Date.UTC(2026, 6, 15, 2))
  })

  it('is exact for UTC', () => {
    expect(zonedTimeToUtc(2026, 3, 9, 17, 'UTC')).toBe(Date.UTC(2026, 2, 9, 17))
  })
})

describe('nextResetAfter', () => {
  const TZ = 'Europe/Madrid'

  it('returns todays reset when now is before it', () => {
    // 01:00 Madrid, reset hour 4 -> 04:00 the same day.
    const now = zonedTimeToUtc(2026, 1, 15, 1, TZ)
    expect(nextResetAfter(now, 4, TZ)).toBe(zonedTimeToUtc(2026, 1, 15, 4, TZ))
  })

  it('returns tomorrows reset when now is past it', () => {
    const now = zonedTimeToUtc(2026, 1, 15, 6, TZ)
    expect(nextResetAfter(now, 4, TZ)).toBe(zonedTimeToUtc(2026, 1, 16, 4, TZ))
  })

  it('treats the reset instant itself as already passed', () => {
    const now = zonedTimeToUtc(2026, 1, 15, 4, TZ)
    expect(nextResetAfter(now, 4, TZ)).toBe(zonedTimeToUtc(2026, 1, 16, 4, TZ))
  })

  it('rolls over month and year boundaries', () => {
    const now = zonedTimeToUtc(2026, 12, 31, 23, TZ)
    expect(nextResetAfter(now, 4, TZ)).toBe(zonedTimeToUtc(2027, 1, 1, 4, TZ))
  })

  it('produces a strictly future instant across a spring-forward DST jump', () => {
    // Madrid springs forward 29 Mar 2026 at 02:00 -> 03:00.
    for (let h = 0; h < 48; h++) {
      const now = Date.UTC(2026, 2, 28) + h * H
      const next = nextResetAfter(now, 4, TZ)
      expect(next).toBeGreaterThan(now)
      expect(next - now).toBeLessThanOrEqual(25 * H)
    }
  })

  it('produces a strictly future instant across an autumn fall-back', () => {
    // Madrid falls back 25 Oct 2026 at 03:00 -> 02:00.
    for (let h = 0; h < 48; h++) {
      const now = Date.UTC(2026, 9, 24) + h * H
      const next = nextResetAfter(now, 4, TZ)
      expect(next).toBeGreaterThan(now)
      expect(next - now).toBeLessThanOrEqual(26 * H)
    }
  })

  it('rejects an out-of-range reset hour', () => {
    expect(() => nextResetAfter(0, 24, TZ)).toThrow(/hour/i)
    expect(() => nextResetAfter(0, -1, TZ)).toThrow(/hour/i)
  })
})

describe('previousResetBefore', () => {
  const TZ = 'Europe/Madrid'

  it('is the reset that opened the current System day', () => {
    const now = zonedTimeToUtc(2026, 1, 15, 6, TZ)
    expect(previousResetBefore(now, 4, TZ)).toBe(zonedTimeToUtc(2026, 1, 15, 4, TZ))
  })

  it('reaches back to yesterday before todays reset', () => {
    const now = zonedTimeToUtc(2026, 1, 15, 1, TZ)
    expect(previousResetBefore(now, 4, TZ)).toBe(zonedTimeToUtc(2026, 1, 14, 4, TZ))
  })

  it('always brackets now together with nextResetAfter', () => {
    for (let h = 0; h < 72; h++) {
      const now = Date.UTC(2026, 2, 28) + h * H + 137_000
      const prev = previousResetBefore(now, 4, TZ)
      const next = nextResetAfter(now, 4, TZ)
      expect(prev).toBeLessThanOrEqual(now)
      expect(next).toBeGreaterThan(now)
    }
  })
})

describe('localDayKey', () => {
  it('labels an instant with its System day, not its UTC day', () => {
    const TZ = 'Europe/Madrid'
    // 02:00 Madrid with a 04:00 reset still belongs to the previous System day.
    expect(localDayKey(zonedTimeToUtc(2026, 1, 15, 2, TZ), 4, TZ)).toBe('2026-01-14')
    expect(localDayKey(zonedTimeToUtc(2026, 1, 15, 5, TZ), 4, TZ)).toBe('2026-01-15')
  })
})
