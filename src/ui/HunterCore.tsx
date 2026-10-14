'use client'

import { useEffect, useRef, useState } from 'react'
import { useSound } from './Experience'

type Point = [number, number, number]
const vertices: Point[] = [[0, -1.5, 0], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [0, 1.5, 0]]
const faces = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]]

/** Perspective-projected geometry, kept small enough to render without a WebGL dependency. */
export function HunterCore({ rank, level }: { rank: string; level: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const energy = useRef(0)
  const [paused, setPaused] = useState(false)
  const play = useSound()

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let phase = 0
    let last = 0
    let visible = true
    let width = 0
    let height = 0
    let accent = ''
    let ink = ''
    const palette = () => {
      const style = getComputedStyle(document.documentElement)
      accent = style.getPropertyValue('--color-accent').trim()
      ink = style.getPropertyValue('--color-ink').trim()
    }
    const project = ([x, y, z]: Point): Point => {
      const yaw = phase * 0.35 + pointer.current.x * 0.5
      const pitch = -0.17 + pointer.current.y * 0.25
      const xx = x * Math.cos(yaw) - z * Math.sin(yaw)
      const zz = x * Math.sin(yaw) + z * Math.cos(yaw)
      const yy = y * Math.cos(pitch) - zz * Math.sin(pitch)
      const depth = y * Math.sin(pitch) + zz * Math.cos(pitch)
      const scale = Math.min(width * 0.25, height * 0.25) * 4 / (4 + depth)
      return [width / 2 + xx * scale, height / 2 + yy * scale, depth]
    }
    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      const glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, height * 0.48)
      glow.addColorStop(0, accent)
      glow.addColorStop(1, 'transparent')
      ctx.globalAlpha = 0.13 + energy.current * 0.12
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = accent
      ctx.lineWidth = 1
      // Three orbital planes encircle the faceted crystal in 3D space.
      for (let ring = 0; ring < 3; ring++) {
        ctx.beginPath()
        for (let i = 0; i <= 96; i++) {
          const a = i / 96 * Math.PI * 2
          const tilt = ring * 1.05 + 0.3
          const r = 1.65 + energy.current * 0.12
          const p = project([Math.cos(a) * r, Math.sin(a) * Math.sin(tilt) * r, Math.sin(a) * Math.cos(tilt) * r])
          if (!i) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1])
        }
        ctx.globalAlpha = 0.2 + ring * 0.07
        ctx.stroke()
      }
      const points = vertices.map(project)
      const sorted = faces.map(face => ({ face, depth: face.reduce((sum, index) => sum + points[index]![2], 0) }))
        .sort((a, b) => b.depth - a.depth)
      for (const { face, depth } of sorted) {
        ctx.beginPath()
        face.forEach((index, i) => { const p = points[index]!; if (!i) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]) })
        ctx.closePath()
        ctx.fillStyle = accent
        ctx.globalAlpha = 0.09 + (3 - depth) * 0.025
        ctx.fill()
        ctx.globalAlpha = depth < 0 ? 0.8 : 0.28
        ctx.stroke()
      }
      ctx.fillStyle = ink
      for (const p of points) {
        ctx.globalAlpha = 0.8
        ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, Math.PI * 2); ctx.fill()
      }
      for (let i = 0; i < 28; i++) {
        const a = i * 2.399 + phase * 0.07
        const radius = 1.85 + (i % 5) * 0.13
        const p = project([Math.cos(a) * radius, Math.sin(a) * radius * 0.7, Math.sin(i * 3) * 0.5])
        ctx.globalAlpha = 0.2 + (i % 3) * 0.14
        ctx.fillRect(p[0], p[1], 1.5, 1.5)
      }
      ctx.globalAlpha = 1
    }
    const tick = (time: number) => {
      const dt = Math.min((time - last) / 1000, 0.05)
      last = time
      phase += dt
      energy.current = Math.max(0, energy.current - dt)
      draw()
      frame = requestAnimationFrame(tick)
    }
    const sync = () => {
      cancelAnimationFrame(frame)
      draw()
      if (!paused && !motion.matches && !document.hidden && visible) {
        last = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }
    const resize = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      width = rect.width; height = rect.height
      const dpr = Math.min(devicePixelRatio || 1, 2)
      el.width = Math.round(width * dpr); el.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      sync()
    })
    const intersection = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; sync() })
    const observer = new MutationObserver(() => { palette(); sync() })
    palette()
    resize.observe(el)
    intersection.observe(el)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    motion.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); intersection.disconnect(); observer.disconnect()
      motion.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync)
    }
  }, [paused])

  return (
    <section className="hunter-core" aria-label={`Hunter core, rank ${rank}, level ${level}`}>
      <div className="core-heading"><span className="label">Hunter resonance</span><span className="core-live">Level {level}</span></div>
      <button className="core-stage" type="button" data-own-sound aria-label="Resonate hunter core"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          pointer.current = { x: (event.clientX - rect.left) / rect.width - 0.5, y: (event.clientY - rect.top) / rect.height - 0.5 }
        }} onPointerLeave={() => { pointer.current = { x: 0, y: 0 } }}
        onClick={() => { energy.current = 1; play('core') }}>
        <canvas ref={canvas} aria-hidden="true" />
        <span className="core-rank" aria-hidden="true">{rank}</span>
      </button>
      <div className="core-footer"><span className="label">{rank}-rank · Touch to resonate</span>
        <button type="button" className="core-motion" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Resume 3D' : 'Pause 3D'}</button>
      </div>
    </section>
  )
}
