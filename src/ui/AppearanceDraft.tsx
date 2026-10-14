'use client'
import { BoundInput, useFormFieldEffect } from '@/assistant/bindings'
import { groundFor } from './themeGrounds'
export function AppearanceDraft({ theme, background }: { theme: string; background: string }) {
  useFormFieldEffect('theme', value => { document.documentElement.dataset.theme = String(value); document.querySelector('meta[name="theme-color"]')?.setAttribute('content',groundFor(String(value))) })
  useFormFieldEffect('background', value => { document.documentElement.dataset.background = String(value) })
  return <><BoundInput type="hidden" name="theme" defaultValue={theme} /><BoundInput type="hidden" name="background" defaultValue={background} /></>
}
