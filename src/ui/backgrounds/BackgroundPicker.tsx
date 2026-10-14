'use client'

import { useEffect, useRef } from 'react'
import { readPalette } from './palette'
import { BACKGROUNDS, BACKGROUND_LABELS, type BackgroundId } from './registry'
import { startBackground, type BackgroundHandle } from './runner'
import { useBackgroundChoice } from './useBackgroundChoice'

/**
 * One live thumbnail.
 *
 * A still image would be the cheap answer and the wrong one: five of these six
 * effects are indistinguishable from each other frozen — the difference between
 * Swirl and Rift is entirely in how they move. So each swatch runs the real
 * shader, at a quarter of the frame rate and a fraction of the pixels.
 *
 * It renders in the *active* theme rather than a fixed palette, because that is
 * the honest preview: the same effect is a different picture in each of the
 * seven, and this is the one place someone is comparing them.
 */
function Preview({ effect }: { effect: BackgroundId }) {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return

    const root = document.documentElement
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')

    let started: BackgroundHandle | null = null
    // Deferred a frame: the element has no laid-out size on the mount pass, and
    // sizing the drawing buffer to 0×0 gives a canvas that never recovers.
    const raf = requestAnimationFrame(() => {
      started = startBackground(el, {
        effect,
        palette: readPalette(root),
        reducedMotion: motion.matches,
        fps: 12,
      })
      if (started) {
        themes.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
      }
    })

    const themes = new MutationObserver(() => started?.setPalette(readPalette(root)))

    return () => {
      cancelAnimationFrame(raf)
      themes.disconnect()
      started?.destroy()
    }
  }, [effect])

  return <canvas ref={canvas} className="background-swatch__canvas" aria-hidden="true" />
}

/**
 * The background picker. Used twice: on Settings, and as the Awakening's
 * interface step, which is why the heading is a prop rather than a constant.
 *
 * The choice applies immediately, like the theme does — a background you cannot
 * see until you press Save somewhere else is a background nobody picks.
 */
export function BackgroundPicker({
  current,
  onSelect,
  heading = 'Interface · background',
}: {
  current: BackgroundId
  onSelect: (id: BackgroundId) => Promise<void>
  heading?: string
}) {
  const { selected, pending, choose } = useBackgroundChoice(current, onSelect)

  return (
    <section className="stack" style={{ gap: 8 }}>
      <div className="between">
        <h2 className="label">{heading}</h2>
        <span className="label" style={{ opacity: pending ? 1 : 0, transition: 'opacity 150ms' }}>
          saved
        </span>
      </div>

      <div role="radiogroup" aria-label="Background" className="background-grid">
        {BACKGROUNDS.map((id) => {
          const active = selected === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(id)}
              className={`background-swatch${active ? ' background-swatch--active' : ''}`}
            >
              <span className="background-swatch__stage">
                {id === 'none' ? (
                  <span className="background-swatch__still" aria-hidden="true" />
                ) : (
                  <Preview effect={id} />
                )}
              </span>
              <span className="background-swatch__name">{BACKGROUND_LABELS[id].name}</span>
              <span className="background-swatch__note">{BACKGROUND_LABELS[id].note}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
