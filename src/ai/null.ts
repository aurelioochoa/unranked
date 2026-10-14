/**
 * The authored System.
 *
 * This is not a stub. `AI_PROVIDER=none` is a fully supported way to run
 * unranked, and it is also the safety net every other adapter falls back to
 * when a model errors or returns nothing usable. If the writing here is thin,
 * the app is thin whenever the network is.
 *
 * Lines vary deterministically with their context, so the System sounds like
 * itself without sounding like a loop.
 */

import { hashSeed } from '@/domain/random'
import type {
  DungeonContext,
  Feat,
  FeatVerdict,
  HunterHistory,
  LevelUpContext,
  PenaltyContext,
  QuestContext,
  Scenario,
  SystemNarrator,
} from './types'

/** Pick deterministically from a set of phrasings. */
function pick<T>(options: readonly T[], seed: string): T {
  return options[hashSeed(seed) % options.length]!
}

async function* lines(...parts: string[]): AsyncIterable<string> {
  for (const p of parts) {
    if (p.length > 0) yield p
  }
}

const STALE_WARNINGS = [
  'The System notes diminishing returns. What was once training is now habit.',
  'You have done this before. It is worth less than it was, and it will keep falling.',
  'Repetition is not progress. The reward reflects that.',
]

const CLEAN_OPENERS = [
  '[Daily Quest has arrived.]',
  '[The Daily Quest has been issued.]',
  '[A new day. The Daily Quest is set.]',
]

export class NullNarrator implements SystemNarrator {
  readonly id = 'none'

  async *narrateQuestIssue(ctx: QuestContext): AsyncIterable<string> {
    const opener = pick(CLEAN_OPENERS, `open:${ctx.dayKey}`)
    const count = ctx.quests.length

    const stalest = [...ctx.quests].sort((a, b) => a.multiplier - b.multiplier)[0]
    const staleNote =
      stalest && stalest.multiplier < 0.7
        ? ` ${pick(STALE_WARNINGS, `stale:${ctx.dayKey}:${stalest.title}`)} ("${stalest.title}")`
        : ''

    const debuffNote =
      ctx.activePenalties > 0
        ? ` [Warning: ${ctx.activePenalties} penalt${ctx.activePenalties === 1 ? 'y' : 'ies'} outstanding. All rewards reduced to ${Math.round(ctx.debuff * 100)}%.]`
        : ''

    yield* lines(
      `${opener} ${count} task${count === 1 ? '' : 's'} for ${ctx.hunterName}, Level ${ctx.level}, Rank ${ctx.rank}.`,
      staleNote,
      debuffNote,
      ' [Failure to complete the Daily Quest will result in an appropriate penalty.]',
    )
  }

  async *narratePenalty(ctx: PenaltyContext): AsyncIterable<string> {
    const missed = ctx.missedTitles.length
    const head =
      ctx.escalation === 0
        ? '[The Daily Quest was not completed.]'
        : `[The penalty was ignored. Escalation ${ctx.escalation}.]`

    // Never announce a count of zero: if the record of what lapsed is gone,
    // say nothing about it rather than something false.
    const abandoned = missed > 0 ? ` ${missed} task${missed === 1 ? '' : 's'} abandoned.` : ''

    yield* lines(
      `${head}${abandoned}`,
      ` You are placed in the Penalty Zone. ${ctx.requirement}`,
      ` You have ${ctx.deadlineInHours} hours. Nothing you have earned is taken from you — but nothing you earn now counts in full until this is cleared.`,
    )
  }

  async *narrateLevelUp(ctx: LevelUpContext): AsyncIterable<string> {
    yield* lines(
      `[Level Up.] ${ctx.hunterName} has reached Level ${ctx.level}.`,
      ` ${ctx.pointsGranted} ability point${ctx.pointsGranted === 1 ? '' : 's'} available. Assign them yourself — the System will not choose for you.`,
    )
  }

  async *narrateDungeon(ctx: DungeonContext): AsyncIterable<string> {
    const minutes = Math.round(ctx.minutes)
    if (ctx.outcome === 'CLEARED') {
      yield* lines(
        `[Instant Dungeon cleared.] "${ctx.objective}" — ${minutes} minutes served, in full.`,
        ` +${ctx.xp} EXP.`,
        ctx.loot.length > 0 ? ` Recovered: ${ctx.loot.join(', ')}.` : '',
      )
      return
    }
    if (ctx.outcome === 'FLED') {
      yield* lines(
        `[You left the dungeon.] "${ctx.objective}" — ${minutes} minutes of the time you set.`,
        ` +${ctx.xp} EXP. No drop. The System records what was attempted, not what was intended.`,
      )
      return
    }
    yield* lines(
      `[Instant Dungeon expired.] "${ctx.objective}" was never closed.`,
      ` +${ctx.xp} EXP, at a reduced rate — the System cannot verify what it did not see.`,
    )
  }

  async weeklyScenario(history: HunterHistory): Promise<Scenario> {
    const focus = history.weakestTrack
    return {
      title: pick(
        ['The Neglected Path', 'A Gate Has Opened', 'The Weakest Link'],
        `scenario:${history.daysActive}`,
      ),
      narration: `Your ${focus.toLowerCase()} has fallen behind the rest of you. The System has noticed. So, presumably, have you.`,
      clearCondition: `Complete four ${focus.toLowerCase()} quests within seven days.`,
      failurePenalty: 'No penalty. This one is not a threat — it is an observation.',
    }
  }

  async judgeFeat(feat: Feat, _history: HunterHistory): Promise<FeatVerdict> {
    // Without a model there is no judgment worth pretending to. Say so plainly
    // rather than rubber-stamping a rank the hunter did not earn.
    return {
      accepted: false,
      reasoning: `The System cannot weigh "${feat.title}" without a judge. Configure an AI provider, or record the feat and rank yourself by hand.`,
      rankAwarded: null,
    }
  }
}
