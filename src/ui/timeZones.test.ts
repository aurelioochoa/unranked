import { describe, expect, it } from 'vitest'
import { canonicalZone, listTimeZones } from './timeZones'

const WINTER = Date.UTC(2026, 0, 15, 12)
const SUMMER = Date.UTC(2026, 6, 15, 12)

function find(groups: ReturnType<typeof listTimeZones>, id: string) {
  return groups.flatMap((g) => g.zones).find((z) => z.id === id)
}

describe('listTimeZones', () => {
  it('offers the whole world, not a shortlist', () => {
    // The bug this replaced shipped nine zones. Any plausible number of real
    // IANA zones is far past that; the point is that it is the runtime's list.
    const total = listTimeZones(WINTER).reduce((n, g) => n + g.zones.length, 0)
    expect(total).toBeGreaterThan(300)
  })

  it('groups by region', () => {
    const groups = listTimeZones(WINTER)
    const areas = groups.map((g) => g.area)
    expect(areas).toContain('Europe')
    expect(areas).toContain('Asia')
    expect(groups.find((g) => g.area === 'Europe')?.zones.some((z) => z.id === 'Europe/Madrid'))
      .toBe(true)
  })

  it('labels the offset for the instant given, so DST is not stale', () => {
    expect(find(listTimeZones(WINTER), 'Europe/Madrid')?.label).toContain('UTC+01:00')
    expect(find(listTimeZones(SUMMER), 'Europe/Madrid')?.label).toContain('UTC+02:00')
  })

  it('signs and pads offsets west of Greenwich', () => {
    expect(find(listTimeZones(WINTER), 'America/New_York')?.label).toContain('UTC-05:00')
  })

  it('handles a half-hour offset', () => {
    // India is spelled Asia/Kolkata by a browser and Asia/Calcutta by this
    // Node; the canonical form is whichever one the host's own list carries.
    const india = canonicalZone('Asia/Kolkata')
    expect(find(listTimeZones(WINTER), india)?.label).toContain('UTC+05:30')
  })

  it('reads the place out of a nested zone name', () => {
    const nested = listTimeZones(WINTER)
      .flatMap((g) => g.zones)
      .find((z) => z.id.split('/').length > 2)
    expect(nested).toBeDefined()
    expect(nested?.label).toContain(' · ')
    expect(nested?.label).not.toContain('_')
  })

  it('canonicalises an alias to the spelling the host actually lists', () => {
    const groups = listTimeZones(WINTER, 'Asia/Kolkata')
    expect(find(groups, canonicalZone('Asia/Kolkata'))).toBeDefined()
  })

  it('keeps a stored zone the runtime does not advertise', () => {
    // Dropping it would leave the picker with nothing selected, and the next
    // save would move the hunter's deadlines to whatever sorted first.
    const groups = listTimeZones(WINTER, 'Europe/Madrid')
    expect(find(groups, 'Europe/Madrid')).toBeDefined()
  })

  it('does not duplicate a stored zone that is already listed', () => {
    const groups = listTimeZones(WINTER, 'Europe/Madrid')
    const hits = groups.flatMap((g) => g.zones).filter((z) => z.id === 'Europe/Madrid')
    expect(hits).toHaveLength(1)
  })

  it('leaves an unresolvable zone out rather than offering a value that fails on save', () => {
    const groups = listTimeZones(WINTER, 'Mars/Olympus_Mons')
    expect(find(groups, 'Mars/Olympus_Mons')).toBeUndefined()
  })
})
