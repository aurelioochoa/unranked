/**
 * Time. Every deadline rule in the System takes a Clock, so the penalty engine
 * can be driven across a month of boundaries in a millisecond of test time.
 * Nothing in `domain/` may call Date.now() directly.
 */

export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number
}

export const systemClock: Clock = { now: () => Date.now() }

/** A clock you drive by hand. The whole reason the deadline rules are testable. */
export class FixedClock implements Clock {
  #t: number

  constructor(start = 0) {
    this.#t = start
  }

  now(): number {
    return this.#t
  }

  set(t: number): void {
    this.#t = t
  }

  advance(ms: number): void {
    if (ms < 0) throw new RangeError('FixedClock cannot advance backwards')
    this.#t += ms
  }
}

const DAY_MS = 86_400_000

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatterCache.set(timeZone, f)
  }
  return f
}

export interface LocalParts {
  year: number
  month: number // 1-12
  day: number // 1-31
  hour: number // 0-23
  minute: number
  second: number
}

/** The wall-clock reading a person in `timeZone` would see at instant `ts`. */
export function localParts(ts: number, timeZone: string): LocalParts {
  const parts = formatterFor(timeZone).formatToParts(new Date(ts))
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const p = parts.find((x) => x.type === type)
    if (!p) throw new Error(`missing ${type} for time zone ${timeZone}`)
    return Number(p.value)
  }
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/**
 * Offset of `timeZone` at instant `ts`, in ms (local minus UTC).
 * Positive east of Greenwich. Accounts for DST at that instant.
 */
export function tzOffsetMs(ts: number, timeZone: string): number {
  const p = localParts(ts, timeZone)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  // ts carries sub-second precision that the formatter dropped; ignore it.
  return asIfUtc - Math.floor(ts / 1000) * 1000
}

/**
 * The instant at which the wall clock in `timeZone` reads the given civil time.
 *
 * Two passes: guess the offset as if the civil time were UTC, then correct using
 * the offset actually in force at the guessed instant. The second pass is what
 * makes DST transitions land on a real instant rather than an hour that never
 * existed.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
  minute = 0,
  second = 0,
): number {
  const civil = Date.UTC(year, month - 1, day, hour, minute, second)
  const firstOffset = tzOffsetMs(civil, timeZone)
  let ts = civil - firstOffset
  const secondOffset = tzOffsetMs(ts, timeZone)
  if (secondOffset !== firstOffset) ts = civil - secondOffset
  return ts
}

function assertResetHour(hour: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`daily reset hour must be an integer 0-23, got ${hour}`)
  }
}

/** Shift a civil date by whole days, on the calendar rather than the timeline. */
function shiftCivilDate(p: LocalParts, days: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day) + days * DAY_MS)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

/**
 * The next daily reset strictly after `now`. A reset landing exactly on `now`
 * counts as already passed, so the returned instant is always in the future.
 */
export function nextResetAfter(now: number, resetHour: number, timeZone: string): number {
  assertResetHour(resetHour)
  const here = localParts(now, timeZone)
  // Three attempts covers today, tomorrow, and any DST pathology in between.
  for (let offset = 0; offset <= 2; offset++) {
    const d = shiftCivilDate(here, offset)
    const candidate = zonedTimeToUtc(d.year, d.month, d.day, resetHour, timeZone)
    if (candidate > now) return candidate
  }
  throw new Error(`could not find a reset after ${now} in ${timeZone}`)
}

/**
 * The most recent daily reset at or before `now` — the instant that opened the
 * current System day.
 */
export function previousResetBefore(now: number, resetHour: number, timeZone: string): number {
  assertResetHour(resetHour)
  const here = localParts(now, timeZone)
  for (let offset = 0; offset >= -2; offset--) {
    const d = shiftCivilDate(here, offset)
    const candidate = zonedTimeToUtc(d.year, d.month, d.day, resetHour, timeZone)
    if (candidate <= now) return candidate
  }
  throw new Error(`could not find a reset before ${now} in ${timeZone}`)
}

/**
 * `YYYY-MM-DD` label for the System day containing `ts`.
 *
 * This is not the calendar date: with a 04:00 reset, 02:00 on the 15th still
 * belongs to the 14th, because you have not yet been handed a new set of quests.
 */
export function localDayKey(ts: number, resetHour: number, timeZone: string): string {
  const opened = previousResetBefore(ts, resetHour, timeZone)
  const p = localParts(opened, timeZone)
  const mm = String(p.month).padStart(2, '0')
  const dd = String(p.day).padStart(2, '0')
  return `${p.year}-${mm}-${dd}`
}

/** Whole System days between two instants, by day label rather than elapsed ms. */
export function dayKeyDistance(
  earlier: number,
  later: number,
  resetHour: number,
  timeZone: string,
): number {
  const a = previousResetBefore(earlier, resetHour, timeZone)
  const b = previousResetBefore(later, resetHour, timeZone)
  return Math.round((b - a) / DAY_MS)
}

/** Days since the epoch for a `YYYY-MM-DD` System-day label. */
export function dayKeyOrdinal(dayKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!m) throw new RangeError(`invalid day key: ${dayKey}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS
}
