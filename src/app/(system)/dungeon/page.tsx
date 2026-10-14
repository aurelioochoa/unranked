import { DungeonForm } from '@/ui/DungeonForm'
import { loadSystem } from '@/server/session'
import { clearDungeonAction, fleeDungeonAction, startDungeonAction } from '@/app/actions'
import { DungeonRun } from '@/ui/DungeonRun'
import { TRACKS, TRACK_NAMES } from '@/domain/types'
import { MAX_DUNGEON_MS, MIN_DUNGEON_MS } from '@/domain/dungeon'

const DURATIONS = [15, 25, 50, 90, 120]

export default function DungeonPage() {
  const view = loadSystem()

  if (view.openRun) {
    return (
      <DungeonRun
        runId={view.openRun.id}
        objective={view.openRun.objective}
        track={view.openRun.track}
        startedAt={view.openRun.startedAt}
        plannedMs={view.openRun.plannedMs}
        clearAction={clearDungeonAction}
        fleeAction={fleeDungeonAction}
      />
    )
  }

  return (
    <>
      {/* `dungeon-view` on the header too: without it the title sat hard left
          on a desktop while the form it belongs to was centred under it. */}
      <header className="page-header dungeon-view">
        <h1 className="system-title">Instant Dungeon</h1>
      </header>

      <main className="stack dungeon-view" style={{ gap: 16 }}>
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
          Declare an objective and a duration. Serve the time and the dungeon pays in full — it is
          the only thing here the System can actually verify, which is why it pays best. Leave
          early and it pays 40% of what you served, with no drop.
        </p>

        <DungeonForm action={startDungeonAction} />
      </main>
    </>
  )
}
