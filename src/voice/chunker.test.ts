import { describe, it, expect } from 'vitest'
import { MAX_CHUNK_CHARS, createSentenceChunker, chunkAll } from './chunker'

describe('createSentenceChunker', () => {
  it('emits nothing until a sentence closes', () => {
    const c = createSentenceChunker()
    expect(c.push('The System ')).toEqual([])
    expect(c.push('is watching')).toEqual([])
    expect(c.push('. ')).toEqual(['The System is watching.'])
  })

  it('emits a sentence at end of input via flush', () => {
    const c = createSentenceChunker()
    c.push('No terminator here')
    expect(c.flush()).toEqual(['No terminator here'])
  })

  it('flushes nothing twice', () => {
    const c = createSentenceChunker()
    c.push('Done.')
    c.flush()
    expect(c.flush()).toEqual([])
  })

  it('handles several sentences arriving in one chunk', () => {
    const c = createSentenceChunker()
    expect(c.push('One. Two! Three? ')).toEqual(['One.', 'Two!', 'Three?'])
  })

  it('closes a bracketed System announcement after the bracket', () => {
    const c = createSentenceChunker()
    expect(c.push('[Daily Quest has arrived.] Two tasks. ')).toEqual([
      '[Daily Quest has arrived.]',
      'Two tasks.',
    ])
  })

  it('does not split a decimal number', () => {
    const c = createSentenceChunker()
    expect(c.push('Rewards fall to 62.5 percent of base. ')).toEqual([
      'Rewards fall to 62.5 percent of base.',
    ])
  })

  it('does not split an ellipsis mid-phrase', () => {
    const c = createSentenceChunker()
    expect(c.push('Wait...')).toEqual([])
    expect(c.push(' and then act. ')).toEqual(['Wait... and then act.'])
  })

  it('never emits a half sentence', () => {
    const c = createSentenceChunker()
    const emitted = [
      ...c.push('The penalty '),
      ...c.push('is active'),
      ...c.push('. All rewards'),
      ...c.push(' reduced.'),
      ...c.flush(),
    ]
    expect(emitted).toEqual(['The penalty is active.', 'All rewards reduced.'])
  })

  it('breaks up a run-on so speech does not stall forever', () => {
    const c = createSentenceChunker()
    const long = 'word '.repeat(200)
    const out = c.push(long)
    expect(out.length).toBeGreaterThan(0)
    for (const s of out) expect(s.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS)
  })

  it('breaks a run-on at a word boundary, never mid-word', () => {
    const c = createSentenceChunker()
    const out = c.push('supercalifragilistic '.repeat(40))
    for (const s of out) expect(s).not.toMatch(/^\S*supercalifragilisti$/)
    expect(out.join(' ').replace(/\s+/g, ' ').trim()).toContain('supercalifragilistic')
  })

  it('drops whitespace-only content', () => {
    const c = createSentenceChunker()
    expect(c.push('   \n  ')).toEqual([])
    expect(c.flush()).toEqual([])
  })

  it('collapses internal newlines so speech does not stutter', () => {
    const c = createSentenceChunker()
    expect(c.push('First line\n\nsecond line. ')).toEqual(['First line second line.'])
  })

  it('loses no words across the whole stream', () => {
    const c = createSentenceChunker()
    const source = '[Level Up.] You reached Level 8. 3 points available! Assign them?'
    const emitted = [...c.push(source), ...c.flush()]
    const joined = emitted.join(' ')
    for (const word of ['Level', 'reached', 'points', 'Assign']) {
      expect(joined).toContain(word)
    }
  })
})

describe('chunkAll', () => {
  it('chunks a whole string in one call', () => {
    expect(chunkAll('One. Two.')).toEqual(['One.', 'Two.'])
  })
})
