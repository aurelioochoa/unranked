'use client'

import { useState, useTransition } from 'react'
import { useSound } from './Experience'

export function QuestSubmit({ action }: { action: () => Promise<void> }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [complete, setComplete] = useState(false)
  const play = useSound()
  return (
    <div>
      <button type="submit" className="btn btn--ghost btn--block" disabled={pending || complete} aria-busy={pending} data-own-sound
        formAction={() => startTransition(async () => {
          setError('')
          try {
            await action()
            setComplete(true)
            play('success')
          } catch {
            setError('Quest could not be cleared. Please try again.')
          }
        })}>
        {pending ? 'Recording clear…' : complete ? 'Quest cleared' : 'Clear quest →'}
      </button>
      {error && <p className="quest-error" role="alert">{error}</p>}
    </div>
  )
}
