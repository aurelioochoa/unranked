import { QuestSubmit } from './QuestSubmit'
import type { QuestView } from '@/server/session'
import { TRACK_STATS } from '@/domain/types'

/**
 * One quest, and — the point of the whole app — what it is worth RIGHT NOW.
 *
 * The multiplier is shown on every card, not hidden in a settings screen.
 * A decayed quest displays its original value struck through next to what it
 * will actually pay, because the whole anti-plateau mechanic is invisible
 * unless the interface says it out loud.
 */
export function QuestCard({
  view,
  action,
}: {
  view: QuestView
  action: (questId: string) => Promise<void>
}) {
  const { quest, template, multiplier, projectedXp, decayNote } = view
  const done = quest.status === 'COMPLETE'
  const failed = quest.status === 'FAILED'
  const decayed = multiplier < 1
  const stats = TRACK_STATS[template.track].join(' · ')

  if (done || failed) {
    return (
      <div className="quest quest--done between">
        <span className="quest__title" style={{ fontSize: 14 }}>
          {template.title}
        </span>
        <span className="numeric faint" style={{ fontSize: 12 }}>
          {failed ? 'FAILED' : `+${quest.awardedXp}`}
        </span>
      </div>
    )
  }

  return (
    <form action={action.bind(null, quest.id)} className="quest">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 5 }}>
          <span className="quest__title">{template.title}</span>
          <span style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <span className={template.track === 'WORK' ? 'chip chip--craft' : 'chip'}>
              {template.track}
            </span>
            <span className="numeric faint" style={{ fontSize: 9 }}>
              {stats}
            </span>
          </span>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 2 }}>
          <span
            className="numeric"
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: decayed ? 'var(--color-decay)' : 'var(--color-accent)',
            }}
          >
            +{projectedXp}
          </span>
          {projectedXp !== template.baseXp && (
            <span
              className="numeric faint"
              style={{ fontSize: 9, textDecoration: decayed ? 'line-through' : 'none' }}
            >
              {template.baseXp}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span className="bar bar--thin" style={{ flex: '1 1 auto' }}>
          <i
            style={{
              width: `${Math.min(100, Math.round(multiplier * 80))}%`,
              background: decayed ? 'var(--color-decay)' : 'var(--color-accent)',
            }}
          />
        </span>
        <span
          className="numeric"
          style={{ fontSize: 9.5, color: decayed ? 'var(--color-decay)' : 'var(--color-accent-bright)' }}
        >
          ×{multiplier.toFixed(2)}
        </span>
      </div>

      {decayNote && (
        <p className="muted" style={{ margin: 0, fontSize: 11 }}>
          {decayNote}
        </p>
      )}

      {template.description && (
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
          {template.description}
        </p>
      )}

      <QuestSubmit action={action.bind(null, quest.id)} />
    </form>
  )
}
