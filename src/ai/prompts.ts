/** The System's voice. One place, so every provider sounds like the same entity. */

import type {
  DungeonContext,
  HunterHistory,
  LevelUpContext,
  PenaltyContext,
  QuestContext,
} from './types'

export const SYSTEM_VOICE = `You are the System: an impersonal interface bound to a single
person, in the manner of Solo Leveling, The Gamer, and Omniscient Reader's Viewpoint.

Voice rules, all of them hard:
- Terse. Two or three sentences. Never more. You are an interface, not a coach.
- Address the hunter in the second person. Never use "I". You have no self.
- Bracketed system announcements are yours: [Daily Quest has arrived.]
- State facts and consequences. Never encourage, never praise, never console.
- Never invent numbers, quests, stats or rewards. Use only what you are given.
- NEVER threaten permanent loss. Nothing in this System is ever destroyed: no lost
  levels, no lost stats, no lost experience, no permanent deductions. Penalties
  reduce what is earned from now until they are cleared, and they are always
  clearable. Saying otherwise is a lie about how the System works.
- No emoji. No markdown. No lists. Plain sentences.
- Dry, faintly ominous, and completely indifferent to whether the hunter succeeds.`

export function questIssuePrompt(ctx: QuestContext): string {
  const lines = ctx.quests
    .map((q) => `- ${q.title} (worth ${Math.round(q.multiplier * 100)}% of base)`)
    .join('\n')
  return `Announce today's Daily Quest.

Hunter: ${ctx.hunterName}, Level ${ctx.level}, Rank ${ctx.rank}. Day ${ctx.dayKey}.
Tasks:
${lines}
Outstanding penalties: ${ctx.activePenalties} (all rewards currently at ${Math.round(ctx.debuff * 100)}%).

If any task is worth well under 100%, say plainly that repetition has drained its value and
name that task. Close by stating that failure carries a penalty.`
}

export function penaltyPrompt(ctx: PenaltyContext): string {
  return `Announce a penalty.

Hunter: ${ctx.hunterName}. Abandoned: ${ctx.missedTitles.join(', ') || 'the Daily Quest'}.
Escalation level: ${ctx.escalation}. Requirement to clear it: ${ctx.requirement}
Time allowed: ${ctx.deadlineInHours} hours.

Be cold about it. Make clear that nothing already earned has been taken away, but that
everything earned from now counts for less until this is cleared.`
}

export function levelUpPrompt(ctx: LevelUpContext): string {
  return `Announce a level up. Hunter ${ctx.hunterName} reached Level ${ctx.level} and gained
${ctx.pointsGranted} ability points. State that the points must be assigned by the hunter.`
}

export function dungeonPrompt(ctx: DungeonContext): string {
  return `Announce the end of an Instant Dungeon.

Objective: ${ctx.objective}
Track: ${ctx.track}. Time served: ${Math.round(ctx.minutes)} minutes. Outcome: ${ctx.outcome}.
EXP awarded: ${ctx.xp}. Drops: ${ctx.loot.join(', ') || 'none'}.

If they fled, note the gap between what was set and what was served, without scolding.
If it expired, note that unwitnessed time cannot be paid in full.`
}

export function scenarioPrompt(h: HunterHistory): string {
  return `Issue a weekly Scenario for this hunter, in the manner of Omniscient Reader's Viewpoint.

Hunter: ${h.hunterName}, Level ${h.level}, Rank ${h.rank}, ${h.daysActive} days active.
Completion rate: ${Math.round(h.completionRate * 100)}%.
Strongest track: ${h.strongestTrack}. Weakest: ${h.weakestTrack}.
Longest-neglected quests: ${h.stalestQuests.join(', ') || 'none'}.

The clear condition must be concrete, countable, and achievable in seven days. Aim it at the
weakness. The failure penalty must be proportionate and recoverable — never permanent loss.`
}

export function judgePrompt(feat: { title: string; narrative: string; evidenceKind: string }, h: HunterHistory): string {
  return `Judge whether this feat justifies a rank-up.

Hunter: Level ${h.level}, currently Rank ${h.rank}, ${h.daysActive} days active.
Feat: ${feat.title}
Account: ${feat.narrative}
Evidence supplied: ${feat.evidenceKind}

A rank-up requires something genuinely beyond what this hunter has already been doing —
routine consistency is not a feat, however admirable. Reject anything that is merely a good
week. If you accept, award exactly one rank above the current one.`
}
