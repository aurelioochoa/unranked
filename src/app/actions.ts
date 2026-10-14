'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { bootstrap, HUNTER_ID } from '@/server/session'
import * as services from '@/server/appServices'
import type { ThemeId } from '@/ui/themeGrounds'
import type { BackgroundId } from '@/ui/backgrounds/registry'

export async function completeQuestAction(questId: string): Promise<void> {
  services.completeQuestService(bootstrap().db, HUNTER_ID, questId)
  revalidatePath('/', 'layout')
}

export async function allocateAction(formData: FormData): Promise<void> {
  services.allocateService(bootstrap().db, HUNTER_ID, formData)
  revalidatePath('/', 'layout')
}

export async function startDungeonAction(formData: FormData): Promise<void> {
  services.startDungeonService(bootstrap().db, HUNTER_ID, formData)
  revalidatePath('/', 'layout')
}

export async function clearDungeonAction(runId: string): Promise<void> {
  services.clearDungeonService(bootstrap().db, HUNTER_ID, runId)
  revalidatePath('/', 'layout')
}

export async function fleeDungeonAction(runId: string): Promise<void> {
  services.fleeDungeonService(bootstrap().db, HUNTER_ID, runId)
  revalidatePath('/', 'layout')
}

export async function resolvePenaltyAction(formData: FormData): Promise<void> {
  services.resolvePenaltyService(bootstrap().db, HUNTER_ID, formData)
  revalidatePath('/', 'layout')
}

export async function setThemeAction(theme: ThemeId): Promise<void> {
  services.setThemeService(bootstrap().db, HUNTER_ID, theme)
  revalidatePath('/', 'layout')
}

export async function setBackgroundAction(background: BackgroundId): Promise<void> {
  services.setBackgroundService(bootstrap().db, HUNTER_ID, background)
  revalidatePath('/', 'layout')
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  services.updateSettingsService(bootstrap().db, HUNTER_ID, formData)
  revalidatePath('/', 'layout')
}

export async function toggleTemplateAction(templateId: string, enabled: boolean): Promise<void> {
  services.toggleTemplateService(bootstrap().db, HUNTER_ID, templateId, enabled)
  revalidatePath('/', 'layout')
}

export async function toggleCoreAction(templateId: string, isCore: boolean): Promise<void> {
  services.toggleCoreService(bootstrap().db, HUNTER_ID, templateId, isCore)
  revalidatePath('/', 'layout')
}

export async function awakenAction(formData: FormData): Promise<void> {
  services.awakenService(bootstrap().db, HUNTER_ID, formData)
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function replayAwakeningAction(): Promise<void> {
  services.replayAwakeningService(bootstrap().db, HUNTER_ID)
  revalidatePath('/', 'layout')
  redirect('/awaken')
}

export async function rebuildLedgerAction(): Promise<void> {
  services.rebuildLedgerService(bootstrap().db, HUNTER_ID)
  revalidatePath('/', 'layout')
}
