'use client'

import { useAssistantBinding } from '@/assistant/bindings'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AWAKENING_STEPS,
  DIFFICULTY_NAMES,
  DIFFICULTY_NOTES,
  QUEST_ROLES,
  QUEST_ROLE_LABELS,
  REFUSAL,
  coreWarning,
  flagsToRole,
  normalizeName,
  type QuestRole,
} from './awakening'
import { BackgroundPicker } from './backgrounds/BackgroundPicker'
import { backgroundOr, type BackgroundId } from './backgrounds/registry'
import { ThemeSwitcher } from './ThemeSwitcher'
import { TimeZoneField } from './TimeZoneField'
import type { ZoneGroup } from './timeZones'
import type { ThemeId } from './themeGrounds'
import { DIFFICULTIES, TRACKS, TRACK_NAMES, type Difficulty, type Track } from '@/domain/types'

export interface AwakeningQuest {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly track: Track
  readonly baseXp: number
  readonly isCore: boolean
  readonly enabled: boolean
}

export interface AwakeningDefaults {
  readonly name: string
  readonly timezone: string
  readonly dailyResetHour: number
  readonly difficulty: Difficulty
  readonly theme: ThemeId
  readonly background: BackgroundId
  readonly rotatingQuestCount: number
}

/**
 * The System's line, typed out.
 *
 * A local typewriter rather than `SystemSpeech`, deliberately: that component
 * reaches for a model and a voice, and the Awakening is the one screen
 * guaranteed to run before either has been configured — on a fresh install,
 * possibly offline, certainly before any weights have been downloaded. These
 * lines are authored, so they need nothing but a timer.
 *
 * It respects reduced motion by simply being finished already.
 */
function Line({ text }: { text: string }) {
  const [shown, setShown] = useState(text)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(text)
      return
    }
    setShown('')
    let i = 0
    const id = setInterval(() => {
      i += 2
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [text])

  return (
    <p className="speech awakening__line" aria-live="polite">
      {shown}
      <span className="awakening__caret" aria-hidden="true" />
    </p>
  )
}

/**
 * The first run.
 *
 * One form across six steps rather than six forms: every step stays mounted and
 * merely hidden, so the whole thing posts once, at the oath, as a single
 * transaction. A half-finished Awakening writes nothing — `onboarded_at` stays
 * null, and closing the tab means starting again rather than landing in a
 * System configured with three of six answers.
 *
 * Theme and background are the exception, and they are an exception on purpose:
 * both apply to the document the instant they are clicked, because step four is
 * asking you to look at them. They are still carried in the form and written
 * with everything else at the end.
 */
export function Awakening({
  defaults,
  zoneGroups,
  quests,
  action,
}: {
  defaults: AwakeningDefaults
  zoneGroups: readonly ZoneGroup[]
  quests: readonly AwakeningQuest[]
  action: (formData: FormData) => Promise<void>
}) {
  const [timezone, setTimezone] = useState(defaults.timezone)
  const [resetHour, setResetHour] = useState(defaults.dailyResetHour)
  const [rotating, setRotating] = useState(defaults.rotatingQuestCount)
  const [step, setStep] = useState(0)
  const [name, setName] = useState(defaults.name)
  const [difficulty, setDifficulty] = useState<Difficulty>(defaults.difficulty)
  const [theme, setTheme] = useState<ThemeId>(defaults.theme)
  const [background, setBackground] = useState<BackgroundId>(defaults.background)
  const [refused, setRefused] = useState(false)
  const nameField = useRef<HTMLInputElement>(null)

  const [roles, setRoles] = useState<Readonly<Record<string, QuestRole>>>(() =>
    Object.fromEntries(quests.map((q) => [q.id, flagsToRole(q)])),
  )

  useAssistantBinding({ id: 'awakening', read: () => ({ step, name, timezone, dailyResetHour: resetHour, difficulty, theme, background, rotatingQuestCount: rotating, core: quests.filter(q => roles[q.id] === 'DAILY').map(q => q.id), enabled: quests.filter(q => roles[q.id] !== 'OFF').map(q => q.id) }), fill: values => {
    if (values.name !== undefined) { setName(values.name); setStep(0) }
    if (values.timezone !== undefined) { setTimezone(values.timezone); setStep(1) }
    if (values.dailyResetHour !== undefined) { setResetHour(values.dailyResetHour); setStep(1) }
    if (values.difficulty !== undefined) { setDifficulty(values.difficulty); setStep(2) }
    if (values.theme !== undefined) { setTheme(values.theme as ThemeId); document.documentElement.dataset.theme = values.theme; setStep(3) }
    if (values.background !== undefined) { setBackground(values.background as BackgroundId); document.documentElement.dataset.background = values.background; setStep(3) }
    if (values.rotatingQuestCount !== undefined) { setRotating(values.rotatingQuestCount); setStep(4) }
    if (values.core || values.enabled) { setRoles(prev => Object.fromEntries(quests.map(q => [q.id, values.core?.includes(q.id) ? 'DAILY' : values.enabled ? values.enabled.includes(q.id) ? 'ROTATION' : 'OFF' : prev[q.id] === 'DAILY' ? 'ROTATION' : (prev[q.id] ?? 'ROTATION')]))); setStep(4) }
    if (values.step !== undefined) setStep(Math.max(0, Math.min(5, values.step)))
  } })

  const cleanName = normalizeName(name)
  const coreCount = useMemo(
    () => Object.values(roles).filter((r) => r === 'DAILY').length,
    [roles],
  )
  const warning = coreWarning(coreCount)
  // Indexed access is unchecked in this project's tsconfig, and the step is
  // clamped by `back`/`next` anyway — fall back to the first rather than
  // reaching for a non-null assertion.
  const current = AWAKENING_STEPS[step] ?? AWAKENING_STEPS[0]
  const last = step === AWAKENING_STEPS.length - 1

  // The name is the only answer that can block progress, so the caret starts
  // in it. Every later step is pre-answered with something sane.
  useEffect(() => {
    if (step === 0) nameField.current?.focus()
  }, [step])

  const back = () => setStep((s) => Math.max(0, s - 1))
  const next = () => setStep((s) => Math.min(AWAKENING_STEPS.length - 1, s + 1))

  return (
    <main className="awakening">
      <header className="awakening__head">
        <h1 className="system-title">Awakening</h1>
        <span className="label numeric">
          {String(step + 1).padStart(2, '0')} / {String(AWAKENING_STEPS.length).padStart(2, '0')}
        </span>
      </header>

      <Line text={current.line} />

      <ol className="awakening__steps" aria-label="Progress">
        {AWAKENING_STEPS.map((s, i) => (
          <li
            key={s.id}
            className={`awakening__step${i === step ? ' awakening__step--current' : ''}${
              i < step ? ' awakening__step--done' : ''
            }`}
            aria-current={i === step ? 'step' : undefined}
          >
            <span className="numeric">{String(i + 1).padStart(2, '0')}</span>
            <span>{s.title}</span>
          </li>
        ))}
      </ol>

      <form action={action} className="stack" style={{ gap: 18 }}>
        {/* Every panel below stays in the DOM whatever step you are on, so the
            answers you already gave are still in the form when it posts. */}

        <section className="panel stack" hidden={step !== 0} style={{ gap: 12 }}>
          <label className="label" htmlFor="awaken-name">
            Designation
          </label>
          <input
            id="awaken-name"
            ref={nameField}
            name="name"
            className="field"
            maxLength={40}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // Enter must not submit the form from step one — there are five
              // more answers to give.
              if (e.key === 'Enter') {
                e.preventDefault()
                if (cleanName) next()
              }
            }}
          />
          <p className="faint" style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
            It appears on the Status window and in everything the System says to you. You can
            change it later; it will not comment on that.
          </p>
        </section>

        <section className="panel stack" hidden={step !== 1} style={{ gap: 14 }}>
          <TimeZoneField name="timezone" groups={zoneGroups} current={timezone} onChange={setTimezone} />
          <div className="row">
            <label style={{ fontSize: 13 }} htmlFor="awaken-reset">
              Day ends at
            </label>
            <select
              id="awaken-reset"
              name="dailyResetHour"
              className="field"
              value={String(resetHour)} onChange={e => setResetHour(Number(e.target.value))}
              style={{ maxWidth: 120, minHeight: 36 }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </div>
          <p className="faint" style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
            Quests are issued at this hour and judged at the next one. Four in the morning is the
            default because a day that ends at midnight punishes you for still being awake.
          </p>
        </section>

        <section className="panel stack" hidden={step !== 2} style={{ gap: 10 }}>
          <input type="hidden" name="difficulty" value={difficulty} />
          <div role="radiogroup" aria-label="Difficulty" className="stack" style={{ gap: 8 }}>
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={difficulty === d}
                onClick={() => setDifficulty(d)}
                className={`choice${difficulty === d ? ' choice--active' : ''}`}
              >
                <span className="choice__name">{DIFFICULTY_NAMES[d]}</span>
                <span className="choice__note">{DIFFICULTY_NOTES[d]}</span>
              </button>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 12, lineHeight: 1.55, margin: 0 }}>
            Difficulty scales the penalty and nothing else. No setting here destroys a level, a
            stat or a single point of experience — that is true at every difficulty.
          </p>
        </section>

        <div className="stack" hidden={step !== 3} style={{ gap: 18 }}>
          <input type="hidden" name="theme" value={theme} />
          <input type="hidden" name="background" value={background} />
          {/* Both pickers apply to the document on click and report back here;
              the hidden inputs above are what actually gets stored. */}
          <ThemeSwitcher
            current={theme}
            onSelect={async (next) => {
              setTheme(next)
            }}
          />
          <BackgroundPicker
            current={background}
            onSelect={async (next) => {
              setBackground(backgroundOr(next))
            }}
          />
        </div>

        <div className="stack" hidden={step !== 4} style={{ gap: 12 }}>
          {TRACKS.map((track) => {
            const inTrack = quests.filter((q) => q.track === track)
            if (inTrack.length === 0) return null
            return (
              <section key={track} className="stack" style={{ gap: 6 }}>
                <h2 className="label">{TRACK_NAMES[track]}</h2>
                {inTrack.map((quest) => {
                  const role = roles[quest.id] ?? 'ROTATION'
                  return (
                    <div key={quest.id} className="quest-role">
                      <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                        <span className="quest-role__title">{quest.title}</span>
                        <span className="quest-role__note">{quest.description}</span>
                      </div>
                      <div
                        role="radiogroup"
                        aria-label={quest.title}
                        className="seg"
                      >
                        {QUEST_ROLES.map((option) => (
                          <button
                            key={option}
                            type="button"
                            role="radio"
                            aria-checked={role === option}
                            className={`seg__option${role === option ? ' seg__option--active' : ''}`}
                            onClick={() =>
                              setRoles((prev) => ({ ...prev, [quest.id]: option }))
                            }
                          >
                            {QUEST_ROLE_LABELS[option]}
                          </button>
                        ))}
                      </div>
                      {role === 'DAILY' && (
                        <input type="hidden" name="core" value={quest.id} />
                      )}
                      {role !== 'OFF' && (
                        <input type="hidden" name="enabled" value={quest.id} />
                      )}
                    </div>
                  )
                })}
              </section>
            )
          })}

          <div className="row">
            <label style={{ fontSize: 13 }} htmlFor="awaken-rotating">
              Rotating quests per day
            </label>
            <input
              id="awaken-rotating"
              name="rotatingQuestCount"
              className="field numeric"
              type="number"
              min={0}
              max={8}
              value={rotating} onChange={e => setRotating(Number(e.target.value))}
              style={{ maxWidth: 88, minHeight: 36 }}
            />
          </div>

          {warning && <p className="awakening__warning">{warning}</p>}
        </div>

        <section className="panel stack" hidden={!last} style={{ gap: 14 }}>
          <dl className="oath">
            <div>
              <dt className="label">Designation</dt>
              <dd>{cleanName ?? '—'}</dd>
            </div>
            <div>
              <dt className="label">Difficulty</dt>
              <dd>{DIFFICULTY_NAMES[difficulty]}</dd>
            </div>
            <div>
              <dt className="label">Daily quests</dt>
              <dd className="numeric">{coreCount}</dd>
            </div>
          </dl>

          <ul className="oath__terms">
            <li>Repetition pays less. Novelty pays more. The System says so on every card.</li>
            <li>A missed day is one penalty, never several, and never more than one at a time.</li>
            <li>Nothing is ever destroyed. A penalty withholds; it does not take back.</li>
            <li>Atonement requires evidence. So does clearing a Gate.</li>
          </ul>

          {refused && <p className="awakening__warning">{REFUSAL}</p>}

          <div className="awakening__seal">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setRefused(true)}
              disabled={refused}
            >
              Decline
            </button>
            <button type="submit" className="btn" disabled={!cleanName}>
              Accept
            </button>
          </div>
        </section>

        <nav className="awakening__nav">
          <button type="button" className="btn btn--ghost" onClick={back} disabled={step === 0}>
            Back
          </button>
          {!last && (
            <button
              type="button"
              className="btn"
              onClick={next}
              disabled={step === 0 && !cleanName}
            >
              Continue
            </button>
          )}
        </nav>
      </form>
    </main>
  )
}
