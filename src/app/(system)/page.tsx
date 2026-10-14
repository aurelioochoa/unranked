import Link from 'next/link'
import { loadSystem } from '@/server/session'
import { allocateAction } from '@/app/actions'
import { EXCELIA_PER_POINT, exceliaProgress } from '@/domain/stats'
import { STATS, STAT_NAMES, type Stat } from '@/domain/types'
import { Allocator } from '@/ui/Allocator'
import { HunterCore } from '@/ui/HunterCore'
import { Countdown } from '@/ui/Countdown'

export default function StatusPage() {
  const view = loadSystem()
  const { hunter, state } = view
  const excelia = hunter.excelia as Partial<Record<Stat, number>>
  const nextQuest = view.quests.find(q => q.quest.status === 'ISSUED')
  const allCleared = view.quests.length > 0 && view.cleared === view.quests.length
  const clearPercent = view.quests.length ? Math.round(view.cleared / view.quests.length * 100) : 0

  return (
    <>
      <header className="page-header status-header">
        <div><p className="label">Player overview / {hunter.rank}-rank</p><h1>Every deed<br /><span>changes you.</span></h1></div>
        <p className="status-intro">Welcome back, {hunter.name}.<br />Your next level starts with what you do today.</p>
      </header>
      <main className="status-dashboard">
        <div className="status-identity stack">
          <HunterCore rank={hunter.rank} level={state.level} />
          <section className="panel hunter-identity">
            <div className="between"><div><span className="label">Hunter</span><h2>{hunter.name}</h2></div><div className="level-badge"><span className="label">Level</span><strong className="numeric">{state.level}</strong></div></div>
            <div className="between xp-label"><span className="label">Next level</span><span className="numeric muted">{state.progress.into.toLocaleString()} / {state.progress.need.toLocaleString()} XP</span></div>
            <div className="bar" role="progressbar" aria-label="Experience to next level" aria-valuenow={Math.round(state.progress.fraction * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${state.progress.fraction * 100}%` }} /></div>
            <div className="between identity-footer"><span className="label">Gold balance</span><span className="numeric gold-value">{state.gold.toLocaleString()} <span aria-hidden="true">◈</span></span></div>
          </section>
        </div>
        <div className="status-details stack">
          <section className="daily-brief panel">
            <div className="between"><h2 className="label">01 / Today's directive</h2><span className="label">Reset in <Countdown to={view.resetAt} className="numeric" /></span></div>
            <h3>{view.openRun ? 'Your dungeon is waiting.' : nextQuest ? 'Make your next move.' : allCleared ? 'Daily quests cleared.' : view.quests.length ? 'Start a fresh session.' : 'Choose your first quest.'}</h3>
            <p>{view.openRun ? view.openRun.objective : nextQuest ? nextQuest.template.title : view.quests.length ? 'Keep growing with a focused dungeon session.' : 'Build a daily practice in your System settings.'}</p>
            <div className="daily-progress"><strong className="numeric">{view.cleared}<span> / {view.quests.length}</span></strong><span className="label">Quests cleared</span><span className="daily-bonus">Full clear +25% XP</span></div>
            <div className="bar bar--thin" role="progressbar" aria-label="Daily quests cleared" aria-valuenow={clearPercent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${clearPercent}%` }} /></div>
            <Link className="btn btn--block directive-link" href={view.openRun ? '/dungeon' : nextQuest ? '/quests' : view.quests.length ? '/dungeon' : '/system'}>{view.openRun ? 'Return to dungeon' : nextQuest ? 'View daily quests' : view.quests.length ? 'Enter a dungeon' : 'Set up quests'} <span aria-hidden="true">↗</span></Link>
          </section>
          <section className="abilities-panel panel">
            <div className="between"><h2 className="label">02 / Abilities</h2><span className="label">Excelia</span></div>
            <div className="ability-list">{STATS.map((stat, index) => {
              const progress = exceliaProgress(excelia[stat] ?? 0)
              return <div className={`ability-row${stat === 'CRA' ? ' ability-row--craft' : ''}`} key={stat}>
                <span className="ability-index numeric">0{index + 1}</span>
                <div className="ability-name"><strong>{STAT_NAMES[stat]}</strong><span className="numeric">{stat}</span></div>
                <strong className="ability-value numeric">{state.stats[stat]}</strong>
                <div className="ability-progress"><span className="bar bar--thin"><i style={{ width: `${progress.fraction * 100}%` }} /></span><span className="numeric">{progress.into} / {EXCELIA_PER_POINT}</span></div>
              </div>
            })}</div>
            <p className="ability-note">Built through action. Each bar tracks the work toward your next earned ability point.</p>
          </section>
          {state.unspentPoints > 0 && <Allocator unspentPoints={state.unspentPoints} stats={state.stats} action={allocateAction} />}
          {view.penalties.length > 0 && <section className="danger-panel"><p>{view.penalties.length} outstanding {view.penalties.length === 1 ? 'penalty' : 'penalties'}. Rewards are at {Math.round(view.debuff * 100)}%.</p><Link href="/quests">Resolve in daily quests →</Link></section>}
        </div>
        <footer className="status-footer"><span className="label">Progress is earned. Never given.</span><Link href="/dungeon">Start a focus session <span aria-hidden="true">↗</span></Link></footer>
      </main>
    </>
  )
}
