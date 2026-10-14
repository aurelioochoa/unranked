import { AppearanceDraft } from '@/ui/AppearanceDraft'
import { AssistantForm, BoundInput, BoundSelect } from '@/assistant/bindings'
import { loadSystem, HUNTER_ID } from '@/server/session'
import {
  rebuildLedgerAction,
  replayAwakeningAction,
  setBackgroundAction,
  setThemeAction,
  toggleCoreAction,
  toggleTemplateAction,
  updateSettingsAction,
} from '@/app/actions'
import { getDb } from '@/db/client'
import { listTemplates } from '@/db/questRepo'
import { DEFAULT_WEBLLM_MODEL, type AiProvider } from '@/ai/config'
import { ThemeSwitcher } from '@/ui/ThemeSwitcher'
import { BackgroundPicker } from '@/ui/backgrounds/BackgroundPicker'
import { backgroundOr } from '@/ui/backgrounds/registry'
import { TimeZoneField } from '@/ui/TimeZoneField'
import { canonicalZone, listTimeZones } from '@/ui/timeZones'
import { IntelligenceSettings } from '@/ui/IntelligenceSettings'
import { QuestSettings } from '@/ui/QuestSettings'
import { VoicePicker } from '@/ui/VoicePicker'
import { DIFFICULTIES } from '@/domain/types'
import type { ThemeId } from '@/ui/themeGrounds'
import type { VoiceAdapterId } from '@/voice/types'

const POLICIES = [
  { id: 'ALWAYS', label: 'everything it says' },
  { id: 'EVENTS', label: 'quests and penalties' },
  { id: 'MANUAL', label: 'only when asked' },
] as const

const DIFFICULTY_NOTES: Record<string, string> = {
  NORMAL: 'A penalty withholds 10% of what you earn until cleared.',
  HARD: 'A penalty withholds 20%.',
  MONARCH: 'A penalty withholds 35%. Escalation bites correspondingly harder.',
}

export default function SystemPage() {
  const view = loadSystem()
  const { hunter, state, ai } = view
  const templates = listTemplates(getDb(), HUNTER_ID)
  // Offsets are labelled for this render's instant, which is why the page is
  // dynamic: a cached list would show the wrong side of a DST change. The
  // stored zone is canonicalised so it matches one of the options it produced.
  const zone = canonicalZone(hunter.timezone)
  const zoneGroups = listTimeZones(Date.now(), zone)

  return (
    <>
      <header className="between page-header">
        <h1 className="system-title">System</h1>
        <span className="label">Settings</span>
      </header>

      <main>
        {/* Theme and background are outside the form: both apply and save the
            moment you pick one, so neither may wait on a Save button at the far
            end of a page. They are also the two settings you change by looking
            at the result, which is the whole reason they preview live. */}
        <div className="settings-grid">
          <ThemeSwitcher current={hunter.theme as ThemeId} onSelect={setThemeAction} />

          <BackgroundPicker
            current={backgroundOr(hunter.background)}
            onSelect={setBackgroundAction}
          />

          <AssistantForm id="settings" action={updateSettingsAction} className="stack settings-form" style={{ gap: 22 }}>
            <AppearanceDraft theme={hunter.theme} background={hunter.background} />
            <section className="stack" style={{ gap: 8 }}>
              <h2 className="label">Hunter</h2>
              <div className="row">
                <label style={{ fontSize: 13 }} htmlFor="name">Name</label>
                <BoundInput id="name" name="name" className="field" maxLength={40}
                       defaultValue={hunter.name} style={{ maxWidth: 240, minHeight: 36 }} />
              </div>
              <div className="row">
                <span style={{ fontSize: 13 }}>Rank</span>
                <span className="numeric muted" style={{ fontSize: 12 }}>
                  {hunter.rank} · earned by feats, never by grinding
                </span>
              </div>
              <div className="row">
                <span style={{ fontSize: 13 }}>Record</span>
                <span className="numeric muted" style={{ fontSize: 12 }}>
                  level {state.level} · {state.totalXp.toLocaleString()} xp · {state.gold} gold
                </span>
              </div>
            </section>

            <IntelligenceSettings
              provider={ai.provider as AiProvider}
              model={hunter.aiModel ?? ai.model}
              baseUrl={hunter.aiBaseUrl ?? ai.baseUrl ?? ''}
              webllmModel={hunter.webllmModel ?? DEFAULT_WEBLLM_MODEL}
              thinking={ai.thinking}
              maxOutputTokens={ai.maxOutputTokens}
              reasoningTokens={ai.reasoningTokens}
              thinkingTimeoutMs={ai.thinkingTimeoutMs}
              apiKeyPresent={Boolean(ai.provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY || ai.apiKey : ai.provider === 'openai' ? process.env.OPENAI_API_KEY || ai.apiKey : ai.apiKey)}
            />

            <VoicePicker
              adapter={hunter.voiceAdapter as VoiceAdapterId}
              voiceId={hunter.voiceId}
              rate={hunter.voiceRate}
              pitch={hunter.voicePitch}
              volume={hunter.voiceVolume}
            />

            <section className="stack" style={{ gap: 8 }}>
              <h2 className="label">When it speaks</h2>
              <div className="row">
                <label style={{ fontSize: 13 }} htmlFor="voicePolicy">Speak</label>
                <BoundSelect id="voicePolicy" name="voicePolicy" className="field"
                        defaultValue={hunter.voicePolicy} style={{ maxWidth: 220, minHeight: 36 }}>
                  {POLICIES.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </BoundSelect>
              </div>
              <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
                Audio needs one tap before a browser will allow it, so the System asks to be
                armed once per session however this is set.
              </p>
            </section>

            <section className="stack" style={{ gap: 8 }}>
              <h2 className="label">The day</h2>
              <div className="row">
                <label style={{ fontSize: 13 }} htmlFor="dailyResetHour">Day starts at</label>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BoundInput id="dailyResetHour" name="dailyResetHour" type="number" min={0} max={23}
                         defaultValue={hunter.dailyResetHour} className="field"
                         style={{ width: 80, minHeight: 36 }} />
                  <span className="faint" style={{ fontSize: 11 }}>:00</span>
                </span>
              </div>

              <TimeZoneField name="timezone" groups={zoneGroups} current={zone} />
              <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
                Deadlines follow your own wall clock, daylight saving included. Today is{' '}
                <span className="numeric">{view.dayKey}</span>.
              </p>

              <div className="row">
                <label style={{ fontSize: 13 }} htmlFor="rotatingQuestCount">Rotating quests</label>
                <BoundInput id="rotatingQuestCount" name="rotatingQuestCount" type="number" min={0} max={8}
                       defaultValue={hunter.rotatingQuestCount} className="field"
                       style={{ width: 80, minHeight: 36 }} />
              </div>

              <div className="row">
                <label style={{ fontSize: 13 }} htmlFor="difficulty">Difficulty</label>
                <BoundSelect id="difficulty" name="difficulty" defaultValue={hunter.difficulty}
                        className="field" style={{ width: 150, minHeight: 36 }}>
                  {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                </BoundSelect>
              </div>
              <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
                {DIFFICULTY_NOTES[hunter.difficulty]} Difficulty scales penalties only — it never
                changes what your work is worth, and the debuff is capped either way.
              </p>
            </section>

            <button type="submit" className="btn btn--block">Save</button>
          </AssistantForm>

          <div className="stack settings-aside" style={{ gap: 22 }}>
            <QuestSettings
              templates={templates.map((t) => ({
                id: t.id,
                title: t.title,
                track: t.track,
                baseXp: t.baseXp,
                isCore: t.isCore,
                enabled: t.enabled,
              }))}
              rotatingCount={hunter.rotatingQuestCount}
              onToggleEnabled={toggleTemplateAction}
              onToggleCore={toggleCoreAction}
            />

            <section className="stack" style={{ gap: 8 }}>
              <h2 className="label">The record</h2>
              <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
                Every point you have ever earned is an entry in an append-only ledger; the numbers
                on the Status window are a cached fold over it. Rebuilding replays that history
                from scratch — safe at any time, and the way to recover if the two ever disagree.
              </p>
              <form action={rebuildLedgerAction}>
                <button type="submit" className="btn btn--ghost btn--block">
                  Rebuild from the ledger
                </button>
              </form>
            </section>

            <section className="stack" style={{ gap: 8 }}>
              <h2 className="label">The Awakening</h2>
              <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
                The first-run ritual, again — name, time zone, deadline, difficulty, interface and
                which quests are asked of you daily, each with the System explaining what it costs.
                It changes nothing on its own: your level, your ledger, your quest history and
                every piece of evidence are untouched, and the current answers are already filled
                in when it opens.
              </p>
              <form action={replayAwakeningAction}>
                <button type="submit" className="btn btn--ghost btn--block">
                  Replay the Awakening
                </button>
              </form>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
