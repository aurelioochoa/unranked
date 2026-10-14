'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

type Cue = 'tap' | 'success' | 'core'
const SoundContext = createContext<(cue: Cue) => void>(() => {})
export const useSound = () => useContext(SoundContext)

/** Short synthesized cues: no downloads, autoplay, or competing voice track. */
export function Experience({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false)
  const audio = useRef<AudioContext | null>(null)
  const enabledRef = useRef(false)
  const lastCue = useRef(0)

  useEffect(() => {
    const read = () => {
      try {
        enabledRef.current = localStorage.getItem('unranked:sound') === 'on'
        setEnabled(enabledRef.current)
      } catch { /* Sound remains optional when storage is unavailable. */ }
    }
    read()
    window.addEventListener('storage', read)
    return () => {
      window.removeEventListener('storage', read)
      void audio.current?.close()
      audio.current = null
    }
  }, [])

  const play = useCallback((cue: Cue) => {
    if (!enabledRef.current || document.hidden) return
    if (cue === 'tap' && performance.now() - lastCue.current < 70) return
    lastCue.current = performance.now()
    try {
      const context = audio.current ??= new AudioContext()
      void context.resume().then(() => {
        if (!enabledRef.current || context.state !== 'running') return
        const notes = cue === 'success' ? [440, 554.37, 659.25, 880] : cue === 'core' ? [164.81, 329.63, 493.88] : [520]
        notes.forEach((frequency, index) => {
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          const start = context.currentTime + index * 0.065
          oscillator.type = 'sine'
          oscillator.frequency.setValueAtTime(frequency, start)
          gain.gain.setValueAtTime(0, start)
          gain.gain.linearRampToValueAtTime(cue === 'tap' ? 0.035 : 0.055, start + 0.008)
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22)
          oscillator.connect(gain).connect(context.destination)
          oscillator.start(start)
          oscillator.stop(start + 0.24)
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
        })
      }).catch(() => {})
    } catch { /* Unsupported audio must never prevent an action. */ }
  }, [])

  return (
    <SoundContext.Provider value={play}>
      <div className="experience" onClick={(event) => {
        const target = event.target as Element
        if (target.closest('a, button') && !target.closest('[data-own-sound]')) play('tap')
      }}>
        <div className="experience-bar">
          <span className="experience-brand"><span aria-hidden="true">◇</span> unranked <span className="experience-edition">/ THE SYSTEM</span></span>
          <button className="sound-toggle" type="button" aria-pressed={enabled} data-own-sound
            onClick={() => {
              const next = !enabled
              enabledRef.current = next
              setEnabled(next)
              try { localStorage.setItem('unranked:sound', next ? 'on' : 'off') } catch { /* Session-only preference. */ }
              if (next) play('core')
              else if (audio.current?.state === 'running') void audio.current.suspend().catch(() => {})
            }}>
            <span aria-hidden="true">{enabled ? '▥' : '▱'}</span> Sound {enabled ? 'on' : 'off'}
          </button>
        </div>
        {children}
      </div>
    </SoundContext.Provider>
  )
}
