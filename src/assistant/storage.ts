import { and, eq, desc } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { assistantMessages, assistantPreferences } from '@/db/schema'
import { messageSchema, preferencesSchema, type AssistantPreferences, type ConversationMessage } from './schema'
export function getPreferences(db: Db, hunterId: string): AssistantPreferences {
  return preferencesSchema.parse(db.select().from(assistantPreferences).where(eq(assistantPreferences.hunterId, hunterId)).get()?.value ?? {})
}
export function savePreferences(db: Db, hunterId: string, value: AssistantPreferences) {
  value = preferencesSchema.parse(value)
  db.insert(assistantPreferences).values({ hunterId, value }).onConflictDoUpdate({ target: assistantPreferences.hunterId, set: { value } }).run()
  return value
}
export function getHistory(db: Db, hunterId: string): ConversationMessage[] {
  return db.select({ id: assistantMessages.id, role: assistantMessages.role, text: assistantMessages.text, at: assistantMessages.at }).from(assistantMessages)
    .where(eq(assistantMessages.hunterId, hunterId)).orderBy(desc(assistantMessages.at)).limit(100).all().reverse()
}
export function saveMessage(db: Db, hunterId: string, input: ConversationMessage) {
  const message = messageSchema.parse(input)
  const existing = db.select().from(assistantMessages).where(eq(assistantMessages.id, message.id)).get()
  if (existing && (existing.hunterId !== hunterId || existing.text !== message.text || existing.role !== message.role)) throw new Error('message id already used')
  db.insert(assistantMessages).values({ ...message, hunterId }).onConflictDoNothing().run()
}
export function clearHistory(db: Db, hunterId: string) { db.delete(assistantMessages).where(and(eq(assistantMessages.hunterId, hunterId))).run() }
