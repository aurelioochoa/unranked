'use client'

import { useEffect, useState, useTransition } from 'react'
import type { BackgroundId } from './registry'

/**
 * Picking a background. The twin of `useThemeChoice`, and for the same reason.
 *
 * The attribute on the document element is the live wire: `Background` watches
 * it, so the effect swaps under your cursor while the write to SQLite happens
 * behind you. Routing the choice through a server round trip instead would put
 * a visible pause between clicking a swatch and seeing it, on the one control
 * whose entire purpose is to be flicked through.
 */
export function useBackgroundChoice(
  current: BackgroundId,
  onSelect: (background: BackgroundId) => Promise<void>,
): { selected: BackgroundId; pending: boolean; choose: (background: BackgroundId) => void } {
  const [selected, setSelected] = useState<BackgroundId>(current)
  const [pending, startTransition] = useTransition()

  useEffect(() => setSelected(current), [current])

  const choose = (background: BackgroundId) => {
    setSelected(background)
    document.documentElement.setAttribute('data-background', background)
    startTransition(() => {
      void onSelect(background)
    })
  }

  return { selected, pending, choose }
}
