/**
 * The list behind the time zone picker.
 *
 * `Intl.supportedValuesOf('timeZone')` is every zone the runtime can actually
 * resolve — a little over four hundred of them — which is the only list worth
 * offering: the previous nine-entry shortcut meant anyone outside western
 * Europe or the two coasts of the United States had to know the exact IANA
 * spelling and type it from memory.
 *
 * Offsets are computed for a given instant rather than hardcoded, so the
 * labels are right on both sides of a daylight-saving change.
 *
 * The names in that list are whichever spellings the host's ICU data uses, and
 * they are not always the modern ones — Node here answers `Asia/Calcutta` and
 * `Europe/Kiev`, while a browser answers `Asia/Kolkata` and `Europe/Kyiv`.
 * Both spellings resolve to the same zone, so everything that has to line up
 * with the list goes through `canonicalZone` first.
 */

import { tzOffsetMs } from '@/domain/clock'

export interface ZoneOption {
  readonly id: string
  /** "Madrid — UTC+02:00" */
  readonly label: string
}

export interface ZoneGroup {
  /** "Europe", or "Other" for the handful with no region prefix. */
  readonly area: string
  readonly zones: readonly ZoneOption[]
}

function offsetLabel(ts: number, zone: string): string {
  const ms = tzOffsetMs(ts, zone)
  const sign = ms < 0 ? '-' : '+'
  const total = Math.abs(Math.round(ms / 60_000))
  const h = String(Math.floor(total / 60)).padStart(2, '0')
  const m = String(total % 60).padStart(2, '0')
  return `UTC${sign}${h}:${m}`
}

/** "America/Argentina/Buenos_Aires" → "Argentina · Buenos Aires" */
function placeOf(id: string): string {
  const parts = id.split('/')
  const rest = parts.length > 1 ? parts.slice(1) : parts
  return rest.join(' · ').replaceAll('_', ' ')
}

function areaOf(id: string): string {
  const slash = id.indexOf('/')
  return slash === -1 ? 'Other' : id.slice(0, slash)
}

/**
 * The host's own spelling of a zone.
 *
 * `resolvedOptions()` answers with the name the runtime's list uses, whatever
 * alias went in, which is exactly what is needed to match a stored value or a
 * device's zone against the options rendered from that list.
 */
export function canonicalZone(id: string): string {
  try {
    return Intl.DateTimeFormat('en', { timeZone: id }).resolvedOptions().timeZone
  } catch {
    return id
  }
}

function supportedZones(): string[] {
  // Guard the call itself: the method is recent, and a runtime without it
  // should degrade to a usable picker rather than crash the settings page.
  try {
    return [...Intl.supportedValuesOf('timeZone')]
  } catch {
    return ['UTC']
  }
}

/**
 * Every resolvable zone, grouped by region and labelled with its offset.
 *
 * `include` is the hunter's stored zone, canonicalised and then added if the
 * runtime still does not list it. Without it a valid stored zone the host has
 * never heard of would leave the picker with nothing selected, and the next
 * save would quietly move the hunter's deadlines to whatever sorted first.
 */
export function listTimeZones(now: number, include?: string): ZoneGroup[] {
  const ids = supportedZones()
  const wanted = include === undefined ? undefined : canonicalZone(include)
  if (wanted !== undefined && !ids.includes(wanted)) ids.push(wanted)

  const byArea = new Map<string, ZoneOption[]>()
  for (const id of ids) {
    let label: string
    try {
      label = `${placeOf(id)} — ${offsetLabel(now, id)}`
    } catch {
      continue // not resolvable here; offering it would only fail on save
    }
    const area = areaOf(id)
    const bucket = byArea.get(area)
    if (bucket) bucket.push({ id, label })
    else byArea.set(area, [{ id, label }])
  }

  return [...byArea.entries()]
    .map(([area, zones]) => ({
      area,
      zones: zones.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.area.localeCompare(b.area))
}
