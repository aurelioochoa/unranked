'use client'
import { useState } from 'react'
import { useAssistantBinding } from '@/assistant/bindings'
import { TRACKS, TRACK_NAMES, type Track } from '@/domain/types'
export function DungeonForm({ action }: { action: (form: FormData) => Promise<void> }) {
  const [objective, setObjective] = useState(''); const [track, setTrack] = useState<Track>('MIND'); const [minutes, setMinutes] = useState(50)
  useAssistantBinding({ id: 'dungeon', read: () => ({ objective, track, minutes }), fill: value => { if (value.objective !== undefined) setObjective(value.objective); if (value.track !== undefined) setTrack(value.track); if (value.minutes !== undefined) setMinutes(value.minutes) } })
  return <form action={action} className="panel stack" style={{ gap: 14 }} data-assistant-form="dungeon">
    <label className="label" htmlFor="objective">Objective</label><input id="objective" name="objective" className="field" placeholder="Ship the migration end to end" maxLength={140} required value={objective} onChange={e => setObjective(e.target.value)} />
    <label className="label" htmlFor="track">Track</label><select id="track" name="track" className="field" value={track} onChange={e => setTrack(e.target.value as Track)}>{TRACKS.map(t => <option key={t} value={t}>{TRACK_NAMES[t]}</option>)}</select>
    <label className="label" htmlFor="minutes">Duration (minutes)</label><input id="minutes" name="minutes" type="number" className="field" min={5} max={240} value={minutes} onChange={e => setMinutes(Number(e.target.value))} />
    <button type="submit" className="btn btn--block">ID Create</button>
  </form>
}
