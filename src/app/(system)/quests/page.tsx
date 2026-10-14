import { AssistantForm, BoundInput } from '@/assistant/bindings'
import { loadSystem } from '@/server/session'
import { completeQuestAction, resolvePenaltyAction } from '@/app/actions'
import { Countdown } from '@/ui/Countdown'
import { SystemSpeech } from '@/ui/SystemSpeech'
import { QuestCard } from '@/ui/QuestCard'
import { buildPenaltyContext, buildQuestContext } from '@/server/narration'
import { DEFAULT_WEBLLM_MODEL } from '@/ai/config'
import type { VoiceAdapterId, VoicePolicy } from '@/voice/types'

export default function QuestsPage() {
  const view = loadSystem()
  const open = view.quests.filter((q) => q.quest.status === 'ISSUED')
  const closed = view.quests.filter((q) => q.quest.status !== 'ISSUED')

  return (
    <>
      <header className="between page-header">
        <h1 className="system-title">Daily Quest</h1>
        <Countdown
          to={view.resetAt}
          className="numeric"
          style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-danger)' }}
        />
      </header>

      <main className="stack" style={{ gap: 14 }}>
        <SystemSpeech
          kind={view.penalties.length > 0 ? 'penalty' : 'quests'}
          adapter={view.hunter.voiceAdapter as VoiceAdapterId}
          voiceId={view.hunter.voiceId}
          rate={view.hunter.voiceRate}
          pitch={view.hunter.voicePitch}
          volume={view.hunter.voiceVolume}
          policy={view.hunter.voicePolicy as VoicePolicy}
          provider={view.ai.provider}
          webllmModel={view.hunter.webllmModel ?? DEFAULT_WEBLLM_MODEL}
          questContext={buildQuestContext(view)}
          penaltyContext={buildPenaltyContext(view)}
        />

        <div className="between">
          <span className="label">
            {view.cleared} / {view.quests.length} cleared
          </span>
          <span className="label">Full clear +25%</span>
        </div>

        <div className="quest-list">
          {open.map((q) => (
            <QuestCard key={q.quest.id} view={q} action={completeQuestAction} />
          ))}
          {closed.map((q) => (
            <QuestCard key={q.quest.id} view={q} action={completeQuestAction} />
          ))}
          {view.quests.length === 0 && (
            <p className="faint" style={{ fontSize: 13 }}>
              No quests are enabled. Add some under System.
            </p>
          )}
        </div>

        {view.penalties.length > 0 && (
          <section className="stack" style={{ gap: 10, marginTop: 6 }}>
            <h2 className="system-title" style={{ color: 'var(--color-danger)', fontSize: 13 }}>
              Penalty Zone
            </h2>
            {view.penalties.map((p) => (
              <AssistantForm id="evidence" recordId={p.id} key={p.id} action={resolvePenaltyAction} className="danger-panel stack" style={{ gap: 10 }}>
                <BoundInput type="hidden" name="penaltyId" defaultValue={p.id} />
                <div className="between">
                  <span className="label" style={{ color: 'var(--color-danger-soft)' }}>
                    Escalation {p.escalation} · rewards at {Math.round(view.debuff * 100)}%
                  </span>
                  <Countdown to={p.dueAt} className="numeric" />
                </div>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--color-ink)' }}>{p.requirement}</p>
                <label className="label" htmlFor={`note-${p.id}`}>
                  Evidence — required
                </label>
                <BoundInput
                  id={`note-${p.id}`}
                  name="note"
                  className="field"
                  placeholder="What you did, and when."
                />
                <label className="label" htmlFor={`url-${p.id}`}>Evidence link (optional)</label>
                <BoundInput id={`url-${p.id}`} name="url" type="url" className="field" placeholder="https://…" />
                <button type="submit" className="btn btn--block">
                  Submit atonement
                </button>
              </AssistantForm>
            ))}
          </section>
        )}

        <p className="danger-panel" style={{ fontSize: 11.5, lineHeight: 1.5, margin: 0 }}>
          [Failure to complete the Daily Quest will result in an appropriate penalty.]
        </p>
      </main>
    </>
  )
}
