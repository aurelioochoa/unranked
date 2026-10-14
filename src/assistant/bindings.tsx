'use client'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react'
import type { FormBinding, FormId, FormValues } from './types'
export interface BindingRegistry { register<K extends FormId>(binding: FormBinding<K>): () => void; get(id: FormId, recordId?: string): FormBinding | undefined }
export const BindingContext = createContext<BindingRegistry | null>(null)
export function useAssistantBinding<K extends FormId>(binding: FormBinding<K>) {
  const registry = useContext(BindingContext); const ref = useRef(binding); ref.current = binding
  useEffect(() => registry?.register({ id: binding.id, recordId: binding.recordId, read: () => ref.current.read(), fill: values => ref.current.fill(values) }), [registry, binding.id, binding.recordId])
}
const DraftContext = createContext<{ values: Record<string, unknown> }>({ values: {} })
export function useFormFieldEffect(name: string, apply: (value: unknown) => void) {
  const { values } = useContext(DraftContext); const applyRef = useRef(apply); applyRef.current = apply
  useEffect(() => { if (Object.hasOwn(values, name)) applyRef.current(values[name]) }, [name, values])
}
export function AssistantForm<K extends FormId>({ id, recordId, children, action, className, style }: { id: K; recordId?: string; children: ReactNode; action: (data: FormData) => Promise<void>; className?: string; style?: React.CSSProperties }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState<Record<string, unknown>>({})
  useAssistantBinding({ id, recordId, read: () => {
    const data = new FormData(formRef.current!)
    const record: Record<string, unknown> = Object.fromEntries(data.entries())
    if (id === 'awakening') { record.core = data.getAll('core'); record.enabled = data.getAll('enabled') }
    return record as unknown as FormValues[K]
  }, fill: patch => setValues(prev => ({ ...prev, ...patch })) })
  return <DraftContext.Provider value={{ values }}><form ref={formRef} action={action} className={className} style={style} data-assistant-form={id}>{children}</form></DraftContext.Provider>
}
export function BoundInput({ defaultValue, name, ...props }: InputHTMLAttributes<HTMLInputElement> & { name: string }) {
  const [value, setValue] = useState(String(defaultValue ?? ''))
  useEffect(() => setValue(String(defaultValue ?? '')), [defaultValue])
  useFormFieldEffect(name, value => setValue(String(value ?? '')))
  return <input {...props} name={name} value={value} onChange={event => { setValue(event.target.value); props.onChange?.(event) }} />
}
export function BoundSelect({ defaultValue, name, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { name: string }) {
  const [value, setValue] = useState(String(defaultValue ?? ''))
  useEffect(() => setValue(String(defaultValue ?? '')), [defaultValue])
  useFormFieldEffect(name, value => setValue(String(value ?? '')))
  return <select {...props} name={name} value={value} onChange={event => { setValue(event.target.value); props.onChange?.(event) }}>{children}</select>
}
