'use client'

import { useEffect, useState, useTransition } from 'react'
import { THEME_GROUNDS, type ThemeId } from './themeGrounds'

/**
 * Picking a theme, shared by every control that offers one.
 *
 * The switch is applied to the document immediately and persisted in the
 * background. Waiting for the server round trip — or worse, for a Save button
 * at the far end of a settings page — makes the control read as broken, which
 * is exactly how the first version of this read.
 *
 * The `<meta name="theme-color">` tag is updated too. The server renders it
 * from the stored theme, so without this the address bar and the PWA splash
 * keep the old theme's colour until the next full load, and the switch looks
 * like it only got halfway.
 */
export function useThemeChoice(
  current: ThemeId,
  onSelect: (theme: ThemeId) => Promise<void>,
): { selected: ThemeId; pending: boolean; choose: (theme: ThemeId) => void } {
  const [selected, setSelected] = useState<ThemeId>(current)
  const [pending, startTransition] = useTransition()

  // If the theme changes elsewhere (the other control, another tab, a reset),
  // follow it rather than showing a stale selection.
  useEffect(() => setSelected(current), [current])

  useEffect(() => {
    const observer = new MutationObserver(() => { const theme = document.documentElement.dataset.theme; if (theme && theme in THEME_GROUNDS) setSelected(theme as ThemeId) })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); return () => observer.disconnect()
  }, [])

  const choose = (theme: ThemeId) => {
    setSelected(theme)
    document.documentElement.setAttribute('data-theme', theme)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_GROUNDS[theme])
    startTransition(() => {
      void onSelect(theme)
    })
  }

  return { selected, pending, choose }
}
