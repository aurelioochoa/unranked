/**
 * The starter quest library.
 *
 * Five tracks, mapped onto the six stats. Core dailies are the ones the System
 * issues every single day — keep this set small, because the decay rule means a
 * large core set turns into a large set of low-value chores. Everything else
 * rotates, weighted toward whatever has been neglected.
 */

import type { Stat, Tier, Track } from '@/domain/types'

export interface StarterTemplate {
  readonly key: string
  readonly title: string
  readonly description: string
  readonly track: Track
  readonly tier: Tier
  readonly statRewards: Partial<Record<Stat, number>>
  readonly baseXp: number
  readonly baseGold: number
  readonly isCore: boolean
}

export const STARTER_TEMPLATES: readonly StarterTemplate[] = Object.freeze([
  // ---- BODY → STR, VIT ----
  {
    key: 'body-strength-session',
    title: 'Strength Training',
    description: 'A full session under load. Lifting, calisthenics — anything that resists you.',
    track: 'BODY',
    tier: 3,
    statRewards: { STR: 34, VIT: 8 },
    baseXp: 160,
    baseGold: 8,
    isCore: true,
  },
  {
    key: 'body-sleep',
    title: 'Seven Hours',
    description: 'Sleep at least seven hours. The cheapest stat gain available to you.',
    track: 'BODY',
    tier: 1,
    statRewards: { VIT: 26 },
    baseXp: 70,
    baseGold: 2,
    isCore: true,
  },
  {
    key: 'body-hydrate',
    title: 'Water Discipline',
    description: 'Two litres of water across the day.',
    track: 'BODY',
    tier: 1,
    statRewards: { VIT: 12 },
    baseXp: 40,
    baseGold: 1,
    isCore: false,
  },
  {
    key: 'body-mobility',
    title: 'Mobility Work',
    description: 'Fifteen minutes of stretching or mobility. Boring, and it compounds.',
    track: 'BODY',
    tier: 1,
    statRewards: { VIT: 14, AGI: 6 },
    baseXp: 55,
    baseGold: 2,
    isCore: false,
  },
  {
    key: 'body-clean-eating',
    title: 'Eat Like It Matters',
    description: 'A day without eating anything you would be embarrassed to log.',
    track: 'BODY',
    tier: 2,
    statRewards: { VIT: 22 },
    baseXp: 90,
    baseGold: 3,
    isCore: false,
  },

  // ---- MIND → INT ----
  {
    key: 'mind-deep-study',
    title: 'Deliberate Practice',
    description: 'An hour of study on something genuinely difficult. Not a video. Practice.',
    track: 'MIND',
    tier: 3,
    statRewards: { INT: 36 },
    baseXp: 170,
    baseGold: 6,
    isCore: true,
  },
  {
    key: 'mind-reading',
    title: 'Read Thirty Pages',
    description: 'A book. Paper or not, but a book.',
    track: 'MIND',
    tier: 2,
    statRewards: { INT: 20 },
    baseXp: 85,
    baseGold: 3,
    isCore: false,
  },
  {
    key: 'mind-build',
    title: 'Build Something',
    description: 'Write code, make a thing, solve a problem end to end.',
    track: 'MIND',
    tier: 3,
    statRewards: { INT: 28, CRA: 12 },
    baseXp: 150,
    baseGold: 8,
    isCore: false,
  },
  {
    key: 'mind-language',
    title: 'Language Drill',
    description: 'Twenty minutes on a language you are learning.',
    track: 'MIND',
    tier: 2,
    statRewards: { INT: 18 },
    baseXp: 75,
    baseGold: 2,
    isCore: false,
  },

  // ---- DISCIPLINE → AGI ----
  {
    key: 'discipline-wake',
    title: 'Rise on Time',
    description: 'Out of bed at the hour you committed to. No negotiation with yourself.',
    track: 'DISCIPLINE',
    tier: 2,
    statRewards: { AGI: 24 },
    baseXp: 95,
    baseGold: 3,
    isCore: true,
  },
  {
    key: 'discipline-cardio',
    title: 'Run',
    description: 'Any sustained cardio. Distance is yours to set; showing up is not.',
    track: 'DISCIPLINE',
    tier: 3,
    statRewards: { AGI: 30, VIT: 10 },
    baseXp: 145,
    baseGold: 6,
    isCore: false,
  },
  {
    key: 'discipline-no-scroll',
    title: 'No Scroll Until Noon',
    description: 'No feeds before midday. The System notices what you do with your mornings.',
    track: 'DISCIPLINE',
    tier: 2,
    statRewards: { AGI: 20, PER: 8 },
    baseXp: 90,
    baseGold: 3,
    isCore: false,
  },
  {
    key: 'discipline-cold',
    title: 'Cold Exposure',
    description: 'End the shower cold. Two minutes.',
    track: 'DISCIPLINE',
    tier: 2,
    statRewards: { AGI: 16, VIT: 10 },
    baseXp: 80,
    baseGold: 2,
    isCore: false,
  },
  {
    key: 'discipline-tidy',
    title: 'Reset the Space',
    description: 'Return your room or desk to zero. Environment is a stat you can see.',
    track: 'DISCIPLINE',
    tier: 1,
    statRewards: { AGI: 12, CRA: 6 },
    baseXp: 50,
    baseGold: 2,
    isCore: false,
  },

  // ---- INNER → PER ----
  {
    key: 'inner-meditate',
    title: 'Sit in Silence',
    description: 'Ten minutes, no input. Watch what your mind does when nothing is feeding it.',
    track: 'INNER',
    tier: 2,
    statRewards: { PER: 26 },
    baseXp: 95,
    baseGold: 2,
    isCore: true,
  },
  {
    key: 'inner-journal',
    title: 'Write the Day Down',
    description: 'What happened, what it cost, what you would do again.',
    track: 'INNER',
    tier: 2,
    statRewards: { PER: 22, INT: 6 },
    baseXp: 90,
    baseGold: 2,
    isCore: false,
  },
  {
    key: 'inner-review',
    title: 'Face the Record',
    description: 'Read back your last week honestly. Name one thing you have been avoiding.',
    track: 'INNER',
    tier: 3,
    statRewards: { PER: 34 },
    baseXp: 140,
    baseGold: 3,
    isCore: false,
  },

  // ---- WORK → CRA ----
  {
    key: 'work-ship',
    title: 'Ship Something',
    description: 'Move one real piece of work from unfinished to finished and out the door.',
    track: 'WORK',
    tier: 4,
    statRewards: { CRA: 40, INT: 8 },
    baseXp: 210,
    baseGold: 20,
    isCore: true,
  },
  {
    key: 'work-ledger',
    title: 'Face the Numbers',
    description: 'Look at what came in and what went out. No flinching.',
    track: 'WORK',
    tier: 2,
    statRewards: { CRA: 20, PER: 8 },
    baseXp: 90,
    baseGold: 6,
    isCore: false,
  },
  {
    key: 'work-outreach',
    title: 'Ask for Something',
    description: 'Send the message you have been putting off. A pitch, an invoice, an application.',
    track: 'WORK',
    tier: 3,
    statRewards: { CRA: 30 },
    baseXp: 150,
    baseGold: 15,
    isCore: false,
  },
  {
    key: 'work-save',
    title: 'Pay Yourself First',
    description: 'Move money to savings or investment before you spend it on anything else.',
    track: 'WORK',
    tier: 3,
    statRewards: { CRA: 32 },
    baseXp: 140,
    baseGold: 25,
    isCore: false,
  },
])
