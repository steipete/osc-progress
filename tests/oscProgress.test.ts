import { describe, expect, test, vi } from 'vitest'
import {
  findOscProgressSequences,
  OSC_PROGRESS_BEL,
  OSC_PROGRESS_C1_ST,
  OSC_PROGRESS_PREFIX,
  OSC_PROGRESS_ST,
  sanitizeLabel,
  sanitizeOscProgress,
  startOscProgress,
  stripOscProgress,
  supportsOscProgress,
} from '../src/oscProgress.js'

describe('sanitizeLabel', () => {
  test('removes escape and OSC terminators', () => {
    const label = `Load\u001b[31m  file${OSC_PROGRESS_ST}${OSC_PROGRESS_BEL}${OSC_PROGRESS_C1_ST}]`
    expect(sanitizeLabel(label)).toBe('Load[31m  file')
  })
})

describe('supportsOscProgress', () => {
  test('requires a TTY', () => {
    expect(supportsOscProgress({ TERM_PROGRAM: 'ghostty' }, false)).toBe(false)
  })

  test('returns false for unknown terminals', () => {
    expect(supportsOscProgress({ TERM_PROGRAM: 'unknown' }, true)).toBe(false)
  })

  test('supports Ghostty/WezTerm/Windows Terminal', () => {
    expect(supportsOscProgress({ TERM_PROGRAM: 'ghostty' }, true)).toBe(true)
    expect(supportsOscProgress({ TERM_PROGRAM: 'WezTerm' }, true)).toBe(true)
    expect(supportsOscProgress({ WT_SESSION: '1' }, true)).toBe(true)
  })

  test('honors force/disabled flags', () => {
    expect(supportsOscProgress({}, true, { disabled: true })).toBe(false)
    expect(supportsOscProgress({}, true, { force: true })).toBe(true)
  })

  test('honors env var overrides', () => {
    expect(
      supportsOscProgress({ NO: '1', TERM_PROGRAM: 'ghostty' }, true, { disableEnvVar: 'NO' })
    ).toBe(false)
    expect(supportsOscProgress({ YES: '1' }, true, { forceEnvVar: 'YES' })).toBe(true)
  })
})

describe('findOscProgressSequences', () => {
  test('finds ST-terminated sequences', () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_ST}b`
    const sequences = findOscProgressSequences(text)
    expect(sequences).toHaveLength(1)
    expect(sequences[0].raw).toBe(`${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_ST}`)
  })

  test('finds BEL-terminated sequences', () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_BEL}b`
    const sequences = findOscProgressSequences(text)
    expect(sequences).toHaveLength(1)
    expect(sequences[0].raw).toBe(`${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_BEL}`)
  })

  test('finds C1 ST terminated sequences', () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_C1_ST}b`
    const sequences = findOscProgressSequences(text)
    expect(sequences).toHaveLength(1)
    expect(sequences[0].raw).toBe(`${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_C1_ST}`)
  })

  test('ignores unterminated sequences', () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;Xb`
    expect(findOscProgressSequences(text)).toEqual([])
  })

  test('chooses the earliest terminator when multiple are present', () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_BEL}${OSC_PROGRESS_ST}b`
    const sequences = findOscProgressSequences(text)
    expect(sequences).toHaveLength(1)
    expect(sequences[0].raw).toBe(`${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_BEL}`)
  })
})

describe('strip/sanitize', () => {
  test('strips multiple sequences with mixed terminators', () => {
    const text = [
      'pre',
      `${OSC_PROGRESS_PREFIX}3;;Waiting${OSC_PROGRESS_ST}`,
      'mid',
      `${OSC_PROGRESS_PREFIX}1;5;Downloading${OSC_PROGRESS_BEL}`,
      'post',
    ].join('')
    expect(stripOscProgress(text)).toBe('premidpost')
  })

  test('strips C1 ST terminated sequences', () => {
    const text = `a${OSC_PROGRESS_PREFIX}1;50;X${OSC_PROGRESS_C1_ST}b`
    expect(stripOscProgress(text)).toBe('ab')
  })

  test('sanitizeOscProgress keeps when requested', () => {
    const text = `${OSC_PROGRESS_PREFIX}3;;Waiting${OSC_PROGRESS_ST}hello`
    expect(sanitizeOscProgress(text, true)).toBe(text)
    expect(sanitizeOscProgress(text, false)).toBe('hello')
  })

  test('stripOscProgress removes unterminated sequences to end of string', () => {
    const text = `pre${OSC_PROGRESS_PREFIX}1;50;Xpost`
    expect(stripOscProgress(text)).toBe('pre')
  })
})

describe('startOscProgress', () => {
  test('noop when not supported', () => {
    const writes: string[] = []
    const stop = startOscProgress({
      write: (chunk) => {
        writes.push(chunk)
      },
      env: { TERM_PROGRAM: 'ghostty' },
      isTty: false,
    })
    stop()
    expect(writes).toEqual([])
  })

  test('indeterminate emits start and clear', () => {
    const writes: string[] = []
    const stop = startOscProgress({
      label: 'Waiting',
      indeterminate: true,
      write: (chunk) => writes.push(chunk),
      env: { TERM_PROGRAM: 'ghostty' },
      isTty: true,
    })
    stop()
    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}3;;Waiting${OSC_PROGRESS_ST}`)
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}0;0;Waiting${OSC_PROGRESS_ST}`)
  })

  test('determinate advances but never reaches 100 by itself', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const stop = startOscProgress({
      label: 'Fetching',
      targetMs: 2_000,
      write: (chunk) => writes.push(chunk),
      env: { TERM_PROGRAM: 'ghostty' },
      isTty: true,
    })

    vi.advanceTimersByTime(3_000)
    stop()
    vi.useRealTimers()

    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}1;0;Fetching${OSC_PROGRESS_ST}`)
    expect(writes.some((w) => w.includes(`${OSC_PROGRESS_PREFIX}1;99;`))).toBe(true)
    expect(writes.at(-1)).toBe(`${OSC_PROGRESS_PREFIX}0;0;Fetching${OSC_PROGRESS_ST}`)
  })

  test('supports BEL terminator', () => {
    const writes: string[] = []
    const stop = startOscProgress({
      label: 'Fetch',
      indeterminate: true,
      terminator: 'bel',
      write: (chunk) => writes.push(chunk),
      env: { TERM_PROGRAM: 'ghostty' },
      isTty: true,
    })
    stop()
    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}3;;Fetch${OSC_PROGRESS_BEL}`)
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}0;0;Fetch${OSC_PROGRESS_BEL}`)
  })

  test('stop is idempotent', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const stop = startOscProgress({
      label: 'Fetch',
      targetMs: 2_000,
      write: (chunk) => writes.push(chunk),
      env: { TERM_PROGRAM: 'ghostty' },
      isTty: true,
    })
    vi.advanceTimersByTime(950)
    stop()
    stop()
    vi.useRealTimers()
    expect(writes.at(-1)).toBe(`${OSC_PROGRESS_PREFIX}0;0;Fetch${OSC_PROGRESS_ST}`)
  })

  test('uses default write (process.stderr.write) when not provided', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const stop = startOscProgress({
        label: 'Waiting',
        indeterminate: true,
        env: { TERM_PROGRAM: 'ghostty' },
        isTty: true,
      })
      stop()
      expect(writeSpy).toHaveBeenCalled()
    } finally {
      writeSpy.mockRestore()
    }
  })
})
