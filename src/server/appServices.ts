import { type Db } from '@/db/client'
import { completeQuest, resolvePenaltyWithEvidence, type CompletionResult } from '@/db/questRepo'
import { clearRunById, fleeRunById, logSystem, startRun, type DungeonRunRow, type RunResult } from '@/db/dungeonRepo'
import {
  appendEvent,
  clearAwakening,
  hunterState,
  markAwakened,
  rebuildHunterCache,
  requireHunter,
  updateSettings,
} from '@/db/hunters'
import { evidence, questTemplates, quests, penalties, dungeonRuns } from '@/db/schema'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import { AI_PROVIDERS } from '@/ai/config'
import type { ThemeId } from '@/ui/themeGrounds'
import { backgroundOr, isBackground, type BackgroundId } from '@/ui/backgrounds/registry'
import { normalizeName } from '@/ui/awakening'
import { allocatePoints } from '@/domain/stats'
import { DIFFICULTIES, STATS, TRACKS, type Difficulty, type Stat, type Track } from '@/domain/types'
import { VOICE_ADAPTERS, VOICE_POLICIES } from '@/voice/types'
import { isTheme } from '@/ui/themeGrounds'
import { settingsSchema, actionSchema, awakeningSchema } from '@/assistant/schema'


export function completeQuestService(db: Db, hunterId: string, questId: string): CompletionResult {
  requireAwakened(db, hunterId)
  own(db, quests, questId, hunterId)
  const result = completeQuest(db, questId, Date.now())
  if (result.leveledUp) {
    logSystem(db, hunterId, 'LEVEL_UP', `Level ${result.levelAfter} reached.`)
  }
  return result
}

export function allocateService(db: Db, hunterId: string, formData: FormData): void {
  requireAwakened(db, hunterId)
  const hunter = requireHunter(db, hunterId)
  const state = hunterState(hunter)

  const spend: Partial<Record<Stat, number>> = {}
  for (const s of STATS) {
    const raw = formData.get(s)
    const n = raw === null ? 0 : Number(raw)
    if (!Number.isInteger(n) || n < 0) throw new Error('stat points must be nonnegative integers')
    if (n > 0) spend[s] = n
  }
  if (Object.keys(spend).length === 0) throw new Error('choose at least one stat point')

  // Throws rather than silently clamping if the form outran the points.
  allocatePoints(state.stats, state.unspentPoints, spend)

  appendEvent(db, {
    hunterId: hunterId,
    at: Date.now(),
    source: 'ALLOCATION',
    allocated: spend,
    note: 'Ability points assigned',
  })
}

export function startDungeonService(db: Db, hunterId: string, formData: FormData): DungeonRunRow {
  requireAwakened(db, hunterId)
  const objective = String(formData.get('objective') ?? '')
  const trackRaw = String(formData.get('track') ?? 'MIND')
  const minutes = Number(formData.get('minutes') ?? 25)

  if (!(TRACKS as readonly string[]).includes(trackRaw)) throw new Error('unknown track')
  const track = trackRaw as Track

  actionSchema.parse({ type: 'startDungeon', objective, track, minutes })
  // createRun validates objective and duration; let it throw rather than
  // quietly starting a run the hunter did not ask for.
  return startRun(db, hunterId, { objective, track, plannedMs: minutes * 60_000 }, Date.now())
}

export function clearDungeonService(db: Db, hunterId: string, runId: string): RunResult {
  requireAwakened(db, hunterId)
  own(db, dungeonRuns, runId, hunterId)
  return clearRunById(db, runId, Date.now())
}

export function fleeDungeonService(db: Db, hunterId: string, runId: string): RunResult {
  requireAwakened(db, hunterId)
  own(db, dungeonRuns, runId, hunterId)
  return fleeRunById(db, runId, Date.now())
}

export function resolvePenaltyService(db: Db, hunterId: string, formData: FormData): void {
  requireAwakened(db, hunterId)
  const penaltyId = String(formData.get('penaltyId') ?? '')
  const note = String(formData.get('note') ?? '').trim()
  const url = String(formData.get('url') ?? '').trim()

  own(db, penalties, penaltyId, hunterId)
  if (note.length > 4000) throw new Error('evidence note is too long')
  if (url && !/^https?:\/\//.test(url)) throw new Error('evidence URL must use http or https')
  if (url.length > 2048) throw new Error('evidence URL is too long')
  // Evidence is the point of this action. Refuse rather than accept a bare claim.
  if (!note && !url) throw new Error('a penalty cannot be cleared without evidence')

  const now = Date.now()
  const id = crypto.randomUUID()

  db.transaction(() => {
  db.insert(evidence)
    .values({
      id,
      hunterId: hunterId,
      kind: url ? 'LINK' : 'NOTE',
      path: null,
      url: url || null,
      note: note || null,
      sha256: null,
      bytes: null,
      createdAt: now,
    })
    .run()

  resolvePenaltyWithEvidence(db, penaltyId, id, now)
  })
}

/** Theme changes apply immediately rather than waiting for a Save. */
export function setThemeService(db: Db, hunterId: string, theme: ThemeId): void {
  if (!isTheme(theme)) return
  updateSettings(db, hunterId, { theme })
}

/** So does the background. Same reasoning: it is a thing you flick through. */
export function setBackgroundService(db: Db, hunterId: string, background: BackgroundId): void {
  if (!isBackground(background)) return
  updateSettings(db, hunterId, { background })
}

function int(formData: FormData, key: string, min: number, max: number): number | undefined {
  const raw = formData.get(key)
  if (raw === null || String(raw).trim() === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

function text(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key)
  if (raw === null) return undefined
  const v = String(raw).trim()
  return v.length > 0 ? v : undefined
}

export function updateSettingsService(db: Db, hunterId: string, formData: FormData): void {
  const patch: Parameters<typeof updateSettings>[2] = {}

  settingsSchema.parse(Object.fromEntries(formData.entries()))

  // --- identity -----------------------------------------------------------
  const name = text(formData, 'name')
  if (name) patch.name = name.slice(0, 40)

  const theme = String(formData.get('theme') ?? '')
  if (isTheme(theme)) patch.theme = theme
  const background = String(formData.get('background') ?? '')
  if (isBackground(background)) patch.background = background

  // --- the model ----------------------------------------------------------
  const provider = String(formData.get('aiProvider') ?? '')
  if ((AI_PROVIDERS as readonly string[]).includes(provider)) patch.aiProvider = provider

  // Empty means "defer to the environment", so an empty box clears the override.
  if (formData.has('aiModel')) patch.aiModel = text(formData, 'aiModel') ?? null
  if (formData.has('aiBaseUrl')) patch.aiBaseUrl = text(formData, 'aiBaseUrl') ?? null
  if (formData.has('webllmModel')) patch.webllmModel = text(formData, 'webllmModel') ?? null

  if (formData.has('aiThinkingPresent')) {
    patch.aiThinking = formData.get('aiThinking') === 'on'
  }
  if (formData.has('aiMaxOutputTokens')) patch.aiMaxOutputTokens = int(formData, 'aiMaxOutputTokens', 50, 4000) ?? null
  if (formData.has('aiReasoningTokens')) patch.aiReasoningTokens = int(formData, 'aiReasoningTokens', 0, 32_000) ?? null
  if (formData.has('aiThinkingTimeoutMs')) patch.aiThinkingTimeoutMs = int(formData, 'aiThinkingTimeoutMs', 5_000, 600_000) ?? null

  // --- voice --------------------------------------------------------------
  const voiceAdapter = String(formData.get('voiceAdapter') ?? '')
  if ((VOICE_ADAPTERS as readonly string[]).includes(voiceAdapter)) {
    patch.voiceAdapter = voiceAdapter
  }
  const voicePolicy = String(formData.get('voicePolicy') ?? '')
  if ((VOICE_POLICIES as readonly string[]).includes(voicePolicy)) {
    patch.voicePolicy = voicePolicy
  }
  if (formData.has('voiceId')) patch.voiceId = text(formData, 'voiceId') ?? null

  const rate = int(formData, 'voiceRate', 10, 200)
  if (rate !== undefined) patch.voiceRate = rate
  const pitch = int(formData, 'voicePitch', 10, 200)
  if (pitch !== undefined) patch.voicePitch = pitch
  const volume = int(formData, 'voiceVolume', 0, 100)
  if (volume !== undefined) patch.voiceVolume = volume

  // --- the day ------------------------------------------------------------
  const resetHour = int(formData, 'dailyResetHour', 0, 23)
  if (resetHour !== undefined) patch.dailyResetHour = resetHour

  const rotating = int(formData, 'rotatingQuestCount', 0, 8)
  if (rotating !== undefined) patch.rotatingQuestCount = rotating

  const difficulty = String(formData.get('difficulty') ?? '')
  if (DIFFICULTIES.includes(difficulty as Difficulty)) {
    patch.difficulty = difficulty as Difficulty
  }

  const timezone = text(formData, 'timezone')
  // Reject a zone the runtime cannot resolve rather than storing a value that
  // would throw on every later deadline calculation.
  if (timezone && isValidTimeZone(timezone)) patch.timezone = timezone

  if (Object.keys(patch).length > 0) updateSettings(db, hunterId, patch)
}

function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** Turn a quest on or off. A disabled template is never issued again. */
export function toggleTemplateService(db: Db, hunterId: string, templateId: string, enabled: boolean): void {
  own(db, questTemplates, templateId, hunterId)
  db
    .update(questTemplates)
    .set({ enabled })
    .where(eq(questTemplates.id, templateId))
    .run()
}

/** Promote or demote a quest between the core dailies and the rotation. */
export function toggleCoreService(db: Db, hunterId: string, templateId: string, isCore: boolean): void {
  own(db, questTemplates, templateId, hunterId)
  db
    .update(questTemplates)
    .set({ isCore })
    .where(eq(questTemplates.id, templateId))
    .run()
}

/**
 * The Awakening, committed.
 *
 * One transaction for the whole ritual. Every answer is validated here and not
 * before: the client's job was to collect them, and a form that posts six
 * answers at once is six chances to be given something the engine cannot use —
 * a time zone the runtime will not resolve is the one that matters, because it
 * would throw on every deadline calculation from then on rather than at the
 * moment it was accepted.
 *
 * `onboardedAt` is set last, inside the same transaction as everything else. If
 * any part of this fails the hunter is still un-awakened and the ritual is
 * offered again, rather than a System configured with half an answer.
 */
export function awakenService(db: Db, hunterId: string, formData: FormData): void {
  const now = Date.now()

  const name = normalizeName(String(formData.get('name') ?? ''))
  if (!name) throw new Error('the System will not proceed without a designation')

  const patch: Parameters<typeof updateSettings>[2] = { name }

  const timezone = text(formData, 'timezone')
  if (timezone && isValidTimeZone(timezone)) patch.timezone = timezone

  const resetHour = int(formData, 'dailyResetHour', 0, 23)
  if (resetHour !== undefined) patch.dailyResetHour = resetHour

  const rotating = int(formData, 'rotatingQuestCount', 0, 8)
  if (rotating !== undefined) patch.rotatingQuestCount = rotating

  const difficulty = String(formData.get('difficulty') ?? '')
  if (DIFFICULTIES.includes(difficulty as Difficulty)) patch.difficulty = difficulty as Difficulty

  const theme = String(formData.get('theme') ?? '')
  if (isTheme(theme)) patch.theme = theme

  settingsSchema.parse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== 'core' && k !== 'enabled')))
  if (!formData.has('timezone') || !formData.has('dailyResetHour') || !formData.has('difficulty') || !formData.has('theme') || !formData.has('background')) throw new Error('finish every Awakening step first')
  patch.background = backgroundOr(String(formData.get('background') ?? ''))

  // The quest step submits ids, not booleans: `core` is what gets issued every
  // day, `enabled` is everything still in play. Both are read as sets so a
  // template the form never mentioned is switched off rather than left as it
  // was — the answer given is the whole answer.
  awakeningSchema.parse({ ...Object.fromEntries(formData.entries()), core: formData.getAll('core').map(String), enabled: formData.getAll('enabled').map(String) })
  const core = new Set(formData.getAll('core').map(String))
  const enabled = new Set(formData.getAll('enabled').map(String))
  for (const id of new Set([...core, ...enabled])) own(db, questTemplates, id, hunterId)
  for (const id of core) if (!enabled.has(id)) throw new Error('daily quests must be enabled')
  const mine = eq(questTemplates.hunterId, hunterId)

  db.transaction((tx) => {
    /*
     * `updateSettings` and `markAwakened` are called on `db` rather than `tx`
     * because they are typed against the whole handle. better-sqlite3 runs
     * everything on a single connection, so statements issued through `db`
     * while this callback is on the stack are inside this same transaction —
     * which is the only reason mixing the two here is safe.
     */
    updateSettings(db, hunterId, patch)

    const applyFlag = (key: 'isCore' | 'enabled', ids: ReadonlySet<string>) => {
      const list = [...ids]
      // `inArray` against an empty list is not valid SQL, so an empty answer
      // is expressed as "clear every one of them" instead.
      if (list.length === 0) {
        tx.update(questTemplates).set({ [key]: false }).where(mine).run()
        return
      }
      tx.update(questTemplates)
        .set({ [key]: true })
        .where(and(mine, inArray(questTemplates.id, list)))
        .run()
      tx.update(questTemplates)
        .set({ [key]: false })
        .where(and(mine, notInArray(questTemplates.id, list)))
        .run()
    }

    applyFlag('isCore', core)
    applyFlag('enabled', enabled)

    markAwakened(db, hunterId, now)
  })

  logSystem(db, hunterId, 'AWAKENING', `${name} has awakened. Rank E.`)
}

/**
 * Ask the questions again.
 *
 * Nothing is erased — this clears one flag, and the next page load lands on the
 * Awakening with every current answer already filled in. It is how you change
 * several settings at once with the System explaining each of them, and it is
 * how the ritual stays reachable after the one time it runs on its own.
 */
export function replayAwakeningService(db: Db, hunterId: string): void {
  clearAwakening(db, hunterId)
}

/** Rebuild the cached counters by replaying the whole ledger. */
export function rebuildLedgerService(db: Db, hunterId: string): void {
  requireAwakened(db, hunterId)
  rebuildHunterCache(db, hunterId)
}

function requireAwakened(db: Db, hunterId: string) {
  if (requireHunter(db, hunterId).onboardedAt === null) throw new Error('complete the Awakening first')
}

function own(db: Db, table: typeof quests | typeof penalties | typeof dungeonRuns | typeof questTemplates, id: string, hunterId: string) {
  const row = db.select({ hunterId: table.hunterId }).from(table).where(eq(table.id, id)).get()
  if (!row || row.hunterId !== hunterId) throw new Error('record is missing or belongs to another hunter')
}
