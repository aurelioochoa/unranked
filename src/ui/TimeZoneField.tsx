'use client'

import { useFormFieldEffect, BoundInput } from '@/assistant/bindings'

import { useEffect, useState } from 'react'
import { canonicalZone, type ZoneGroup } from './timeZones'

/**
 * Choosing a time zone.
 *
 * This was a text input with a `<datalist>` of nine zones. A datalist on a
 * text input draws no affordance in Chrome — no arrow, nothing to click — so
 * it looked like a plain text box that did nothing, and even when it did open,
 * nine zones is not a list of the world's time zones. It is a real `<select>`
 * over every zone the runtime can resolve, which types-to-jump like any native
 * select and works on a phone.
 *
 * The clock beside it is the confirmation that matters: the whole point of the
 * setting is which wall clock your deadlines follow, so the picker shows what
 * that clock currently reads.
 */
export function TimeZoneField({
  name,
  groups,
  current,
  onChange,
}: {
  name: string
  groups: readonly ZoneGroup[]
  current: string
  onChange?: (zone: string) => void
}) {
  const [zone, setZoneState] = useState(current)
  const setZone = (value: string) => { setZoneState(value); onChange?.(value) }
  useEffect(() => setZoneState(current), [current])
  const [nowThere, setNowThere] = useState<string | null>(null)
  const [deviceZone, setDeviceZone] = useState<string | null>(null)

  useEffect(() => {
    try {
      setDeviceZone(canonicalZone(Intl.DateTimeFormat().resolvedOptions().timeZone))
    } catch {
      setDeviceZone(null)
    }
  }, [])

  // Mounted-only: the server and the browser would otherwise render different
  // seconds and hydration would warn about it every single load.
  useEffect(() => {
    const tick = () => {
      try {
        setNowThere(
          new Intl.DateTimeFormat('en-GB', {
            timeZone: zone,
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'short',
          }).format(new Date()),
        )
      } catch {
        setNowThere(null)
      }
    }
    tick()
    const id = setInterval(tick, 10_000)
    return () => clearInterval(id)
  }, [zone])

  useFormFieldEffect('timezone', v => setZone(String(v)))

  const elsewhere = deviceZone !== null && deviceZone !== zone

  // The options were built from the server's zone list; the browser has its
  // own, and the two spell some zones differently — Node here says
  // `Asia/Calcutta` where Chrome says `Asia/Kolkata`. Anything selectable that
  // the list does not carry gets its own option rather than being dropped: a
  // `<select>` whose value matches no option renders blank, which would read
  // as the setting having been lost.
  const known = new Set(groups.flatMap((g) => g.zones.map((z) => z.id)))
  const extras = [deviceZone, zone].filter(
    (id): id is string => id !== null && !known.has(id),
  )

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <label style={{ fontSize: 13 }} htmlFor={name}>
          Time zone
        </label>
        <select
          id={name}
          name={name}
          className="field"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          style={{ maxWidth: 260, minHeight: 36 }}
        >
          {extras.length > 0 && (
            <optgroup label="Other">
              {[...new Set(extras)].map((id) => (
                <option key={id} value={id}>
                  {id.replaceAll('_', ' ')}
                </option>
              ))}
            </optgroup>
          )}
          {groups.map((group) => (
            <optgroup key={group.area} label={group.area}>
              {group.zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="between" style={{ gap: 8 }}>
        <span className="numeric faint" style={{ fontSize: 11 }} suppressHydrationWarning>
          {nowThere === null ? ' ' : `It is ${nowThere} there.`}
        </span>
        {elsewhere && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setZone(deviceZone)}
          >
            Use this device
          </button>
        )}
      </div>
    </div>
  )
}
