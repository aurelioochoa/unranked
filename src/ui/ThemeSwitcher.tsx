'use client'

import { THEMES, THEME_LABELS, type ThemeId } from './themeGrounds'
import { useThemeChoice } from './useThemeChoice'

/**
 * The full theme picker, on the Settings page.
 *
 * Each swatch renders a miniature System panel in its own theme rather than a
 * flat colour chip: most of the grounds are near-black, so a ground-only
 * swatch makes several different themes look like the same square repeated.
 *
 * `ThemeMenu` in the navigation is the same choice in one tap from anywhere;
 * this one is the version with room to explain what each theme is.
 */
export function ThemeSwitcher({
  current,
  onSelect,
}: {
  current: ThemeId
  onSelect: (theme: ThemeId) => Promise<void>
}) {
  const { selected, pending, choose } = useThemeChoice(current, onSelect)

  return (
    <section className="stack" style={{ gap: 8 }}>
      <div className="between">
        <h2 className="label">Interface · theme</h2>
        <span className="label" style={{ opacity: pending ? 1 : 0, transition: 'opacity 150ms' }}>
          saved
        </span>
      </div>

      <div role="radiogroup" aria-label="Theme" className="theme-grid">
        {THEMES.map((id) => {
          const active = selected === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(id)}
              className={`theme-swatch${active ? ' theme-swatch--active' : ''}`}
            >
              {/* The preview renders in its own theme, so the tokens resolve to
                  that theme's palette rather than the active one. */}
              <span data-theme={id} className="theme-preview" aria-hidden="true">
                <span className="theme-preview__bar" />
                <span className="theme-preview__rule" />
                <span className="theme-preview__rule theme-preview__rule--short" />
                <span className="theme-preview__dot" />
              </span>
              <span className="theme-swatch__name">{THEME_LABELS[id].name}</span>
              <span className="theme-swatch__note">{THEME_LABELS[id].note}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
