let stopOwner: (() => void) | null = null
export function claimAudio(stop: () => void) { stopOwner?.(); stopOwner = stop; return () => { if (stopOwner === stop) stopOwner = null } }
export function stopAllAudio() { stopOwner?.(); stopOwner = null }
