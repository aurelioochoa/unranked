/**
 * Sentence chunking.
 *
 * This is what makes the voice real-time. Text arrives from the model token by
 * token; the moment a sentence closes, it goes to the speech engine while the
 * model is still writing the next one. Waiting for the full generation before
 * speaking would add seconds of dead air to every System line.
 *
 * Two rules the tests pin down: never emit a half sentence, and never lose the
 * tail.
 */

/** A run-on longer than this is broken at a word boundary so speech can start. */
export const MAX_CHUNK_CHARS = 220

const TERMINATORS = new Set(['.', '!', '?', '…'])
/** Characters that may close a sentence after its terminator. */
const CLOSERS = new Set([']', ')', '"', "'", '»', '”', '’'])

export interface SentenceChunker {
  /** Feed a token. Returns whichever complete sentences that token closed. */
  push(text: string): string[]
  /** Emit whatever is left. Call once when the stream ends. */
  flush(): string[]
}

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9'
}

export function createSentenceChunker(): SentenceChunker {
  let buffer = ''

  /** Index just past the end of the first complete sentence, or -1. */
  function boundary(): number {
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i]!
      if (!TERMINATORS.has(ch)) continue

      // 62.5 is one number, not two sentences.
      if (ch === '.' && isDigit(buffer[i - 1]) && isDigit(buffer[i + 1])) continue

      // Absorb a run of terminators (...) and any closing brackets or quotes.
      let end = i
      while (end + 1 < buffer.length && TERMINATORS.has(buffer[end + 1]!)) end++
      while (end + 1 < buffer.length && CLOSERS.has(buffer[end + 1]!)) end++

      const next = buffer[end + 1]
      // A sentence only ends if whitespace follows. If nothing follows yet, the
      // stream may still be mid-token — wait rather than guess.
      if (next === undefined || !/\s/.test(next)) continue

      // Look past the space: a lowercase continuation means this was a pause,
      // not an ending — "Wait... and then act.", "e.g. the penalty". Splitting
      // there would put a full stop in the middle of a spoken clause.
      let after = end + 1
      while (after < buffer.length && /\s/.test(buffer[after]!)) after++
      const following = buffer[after]
      if (following !== undefined && following === following.toLowerCase() && /[a-z]/i.test(following)) {
        continue
      }

      return end + 1
    }
    return -1
  }

  /** Split an over-long buffer at the last word boundary inside the limit. */
  function forcedBreak(): number {
    if (buffer.length <= MAX_CHUNK_CHARS) return -1
    const window = buffer.slice(0, MAX_CHUNK_CHARS)
    const at = window.lastIndexOf(' ')
    return at > 0 ? at : MAX_CHUNK_CHARS
  }

  function drain(): string[] {
    const out: string[] = []
    for (;;) {
      let cut = boundary()
      if (cut === -1) cut = forcedBreak()
      if (cut === -1) break
      const piece = tidy(buffer.slice(0, cut))
      buffer = buffer.slice(cut)
      if (piece.length > 0) out.push(piece)
    }
    return out
  }

  return {
    push(text) {
      buffer += text
      return drain()
    },
    flush() {
      const out = drain()
      const rest = tidy(buffer)
      buffer = ''
      if (rest.length > 0) out.push(rest)
      return out
    },
  }
}

/** Chunk a complete string in one go. */
export function chunkAll(text: string): string[] {
  const c = createSentenceChunker()
  return [...c.push(text), ...c.flush()]
}
