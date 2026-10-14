'use client'

import { useEffect, useState } from 'react'

/**
 * A live countdown to a server-supplied instant.
 *
 * The deadline is an absolute timestamp decided by the server, never a
 * duration counted down on the client — so a paused tab, a sleeping laptop or
 * a fiddled system clock cannot buy extra time.
 */
export function Countdown({
  to,
  className,
  style,
  onElapsed,
}: {
  to: number
  className?: string
  style?: React.CSSProperties
  onElapsed?: () => void
}) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (now !== null && now >= to) onElapsed?.()
  }, [now, to, onElapsed])

  // Render nothing meaningful until mounted: the server and the client would
  // otherwise disagree by exactly the round-trip time and hydration would warn.
  if (now === null) return <span className={className} style={style}>--:--:--</span>

  const remaining = Math.max(0, to - now)
  const total = Math.floor(remaining / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  return (
    <span className={className} style={style} suppressHydrationWarning>
      {h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}
    </span>
  )
}
