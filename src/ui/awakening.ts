/**
 * The Awakening — its shape, its script, and the rules for what it accepts.
 *
 * Pure and framework-free so the parts that can actually be wrong are testable
 * without a browser: what counts as a name, and how many core dailies is too
 * many. The decay rule makes an over-stuffed core set the single most damaging
 * thing a new hunter can do to themselves — six identical chores every day,
 * every one of them worth less by the end of the week — so the step that picks
 * them says so before it lets you leave.
 *
 * The lines are authored, not generated. A first run must work with
 * `AI_PROVIDER=none`, offline, before any model has been downloaded; the
 * System's own script is what it falls back to everywhere else too.
 */

import type { Difficulty } from '@/domain/types'

export const AWAKENING_STEPS = [
  {
    id: 'designation',
    title: 'Designation',
    line: 'You have been selected. Before anything else — what should I call you?',
  },
  {
    id: 'day',
    title: 'The Day',
    line: 'Your day has to end somewhere. That boundary is where I judge you.',
  },
  {
    id: 'difficulty',
    title: 'Difficulty',
    line: 'Decide now how hard I am allowed to be. You will not enjoy changing it later.',
  },
  {
    id: 'interface',
    title: 'Interface',
    line: 'This window is yours. Make it something you will want to open.',
  },
  {
    id: 'quests',
    title: 'First Quests',
    line: 'Choose what I ask of you daily. Choose few — I pay less for repetition.',
  },
  {
    id: 'oath',
    title: 'The Oath',
    line: 'Nothing here is taken on trust, and nothing here is ever destroyed. Well?',
  },
] as const

export type AwakeningStepId = (typeof AWAKENING_STEPS)[number]['id']

export const STEP_COUNT = AWAKENING_STEPS.length

/** The System's reply to declining. There is only ever the one answer. */
export const REFUSAL =
  'Refusal was never on the table. It is written on the panel because you are owed the chance to read it twice.'

export const MAX_NAME = 40

/**
 * What the System will answer to.
 *
 * Collapses runs of whitespace, because a name pasted out of a document
 * arrives with newlines in it and would render as a broken heading forever
 * after. Returns null when there is nothing left, which is what stops the
 * first step advancing.
 */
export function normalizeName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
  return name.length > 0 ? name : null
}

/**
 * The warning shown under the quest step, or null when the set is sane.
 *
 * Three is the seeded default and reads as comfortable. Past five, the decay
 * rule turns the daily set into a chore list that pays a fraction of its
 * face value — which is a design decision worth stating out loud rather than
 * discovering in week two.
 */
export function coreWarning(count: number): string | null {
  if (count === 0) {
    return 'No daily quests. The Daily Quest window will be empty, and so will the Penalty Zone.'
  }
  if (count > 5) {
    return `${count} daily quests. Repetition pays less every day — this many will be worth a fraction of face value inside a week.`
  }
  return null
}

export const DIFFICULTY_NOTES: Readonly<Record<Difficulty, string>> = Object.freeze({
  NORMAL: 'A penalty withholds 10% of what you earn until it is cleared.',
  HARD: 'A penalty withholds 20%. Escalation bites sooner.',
  MONARCH: 'A penalty withholds 35%, and escalation bites correspondingly harder.',
})

export const DIFFICULTY_NAMES: Readonly<Record<Difficulty, string>> = Object.freeze({
  NORMAL: 'Normal',
  HARD: 'Hard',
  MONARCH: 'Monarch',
})

/** How a quest is treated once the Awakening is over. */
export const QUEST_ROLES = ['DAILY', 'ROTATION', 'OFF'] as const
export type QuestRole = (typeof QUEST_ROLES)[number]

export const QUEST_ROLE_LABELS: Readonly<Record<QuestRole, string>> = Object.freeze({
  DAILY: 'Daily',
  ROTATION: 'Rotation',
  OFF: 'Off',
})

/** The two booleans the database actually stores, from the one choice made. */
export function roleToFlags(role: QuestRole): { isCore: boolean; enabled: boolean } {
  return {
    isCore: role === 'DAILY',
    enabled: role !== 'OFF',
  }
}

export function flagsToRole(flags: { isCore: boolean; enabled: boolean }): QuestRole {
  if (!flags.enabled) return 'OFF'
  return flags.isCore ? 'DAILY' : 'ROTATION'
}
