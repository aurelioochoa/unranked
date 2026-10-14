'use client'

import { useEffect, useRef, useState } from 'react'
import { THEMES, THEME_LABELS, type ThemeId } from './themeGrounds'
import { useThemeChoice } from './useThemeChoice'

/**
 * The theme switcher that is always within reach.
 *
 * It lives in the navigation because that is the only element on every screen.
 * A theme is not a setting you configure once — it is the thing you change
 * because the room got dark, or because you are outside and the near-black
 * ground has stopped being readable, and having to walk to Settings to do it
 * is the reason nobody found the picker that was already there.
 */
export function ThemeMenu({
  current,
  onSelect,
}: {
  current: ThemeId
  onSelect: (theme: ThemeId) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const { selected, choose } = useThemeChoice(current, onSelect)
  const root = useRef<HTMLDivElement>(null)

  // Dismiss the way a menu is expected to: click anywhere else, or Escape.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="nav-theme" ref={root}>
      <button
        type="button"
        className="nav-theme__button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Theme — ${THEME_LABELS[selected].name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span data-theme={selected} className="nav-theme__chip" aria-hidden="true" />
        <span className="nav-theme__label">Theme</span>
      </button>

      {open && (
        <div role="radiogroup" aria-label="Theme" className="nav-theme__menu">
          {THEMES.map((id) => {
            const active = selected === id
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                className={`nav-theme__item${active ? ' nav-theme__item--active' : ''}`}
                onClick={() => {
                  choose(id)
                  setOpen(false)
                }}
              >
                {/* Painted in its own theme, so the chip is the palette itself
                    rather than a description of it. */}
                <span data-theme={id} className="nav-theme__chip" aria-hidden="true" />
                <span className="nav-theme__name">{THEME_LABELS[id].name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
