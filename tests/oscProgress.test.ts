import { describe, expect, test, vi } from 'vitest'
import {
  createOscProgressController,
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

describe('createOscProgressController', () => {
  test('noop when not supported', () => {
    const writes: string[] = []
    const osc = createOscProgressController({
      write: (chunk) => writes.push(chunk),
      env: { TERM_PROGRAM: 'ghostty' },
      isTty: false,
    })

    osc.setIndeterminate('Waiting')
    osc.setPercent('Transcribing', 50)
    osc.setPaused('Paused')
    osc.done('Done')
    osc.fail('Fail')
    osc.clear()
    osc.dispose()

    expect(writes).toEqual([])
  })

  test('emits indeterminate, percent, and clear frames', () => {
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      label: 'Init',
      write: (data) => writes.push(data),
    })

    osc.setIndeterminate('Waiting')
    osc.setPercent('Transcribing', 50)
    osc.clear()

    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}3;;Waiting${OSC_PROGRESS_ST}`)
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}1;50;Transcribing${OSC_PROGRESS_ST}`)
    expect(writes[2]).toBe(`${OSC_PROGRESS_PREFIX}0;0;Transcribing${OSC_PROGRESS_ST}`)
  })

  test('clear uses the initial label if nothing was set yet', () => {
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      label: 'Init',
      write: (data) => writes.push(data),
    })

    osc.clear()

    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}0;0;Init${OSC_PROGRESS_ST}`)
  })

  test('rounds and clamps percent to [0..100]', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 12.4)
    vi.advanceTimersByTime(200)
    osc.setPercent('Downloading', 12.5)
    vi.advanceTimersByTime(200)
    osc.setPercent('Downloading', -10)
    vi.advanceTimersByTime(200)
    osc.setPercent('Downloading', 9000)

    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}1;12;Downloading${OSC_PROGRESS_ST}`)
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}1;13;Downloading${OSC_PROGRESS_ST}`)
    expect(writes[2]).toBe(`${OSC_PROGRESS_PREFIX}1;0;Downloading${OSC_PROGRESS_ST}`)
    expect(writes[3]).toBe(`${OSC_PROGRESS_PREFIX}1;100;Downloading${OSC_PROGRESS_ST}`)
    vi.useRealTimers()
  })

  test('sanitizes labels before emitting', () => {
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      write: (data) => writes.push(data),
    })

    osc.setIndeterminate(`Load\u001b[31m file${OSC_PROGRESS_ST}${OSC_PROGRESS_BEL}]`)

    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}3;;Load[31m file${OSC_PROGRESS_ST}`)
  })

  test('supports BEL terminator', () => {
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      terminator: 'bel',
      write: (data) => writes.push(data),
    })

    osc.setIndeterminate('Waiting')
    osc.setPercent('Transcribing', 50)
    osc.clear()

    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}3;;Waiting${OSC_PROGRESS_BEL}`)
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}1;50;Transcribing${OSC_PROGRESS_BEL}`)
    expect(writes[2]).toBe(`${OSC_PROGRESS_PREFIX}0;0;Transcribing${OSC_PROGRESS_BEL}`)
  })

  test('uses default write (process.stderr.write) when not provided', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const osc = createOscProgressController({
        env: { TERM_PROGRAM: 'wezterm' },
        isTty: true,
      })

      osc.setPercent('Downloading', 1)
      osc.clear()

      expect(writeSpy).toHaveBeenCalled()
    } finally {
      writeSpy.mockRestore()
    }
  })

  test('throttles rapid determinate updates', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 1)
    osc.setPercent('Downloading', 2)
    osc.setPercent('Downloading', 3)
    expect(writes).toHaveLength(1)

    vi.advanceTimersByTime(200)
    osc.setPercent('Downloading', 4)
    expect(writes).toHaveLength(2)
    vi.useRealTimers()
  })

  test('dedupes identical updates even after time passes', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 10)
    vi.advanceTimersByTime(200)
    osc.setPercent('Downloading', 10)
    expect(writes).toHaveLength(1)
    vi.useRealTimers()
  })

  test('emits stalled state after inactivity', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      stallAfterMs: 1_000,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 5)
    expect(writes[0]).toBe(`${OSC_PROGRESS_PREFIX}1;5;Downloading${OSC_PROGRESS_ST}`)

    vi.advanceTimersByTime(1_000)
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}4;5;Downloading (stalled)${OSC_PROGRESS_ST}`)

    osc.setPercent('Downloading', 6)
    expect(writes[2]).toBe(`${OSC_PROGRESS_PREFIX}1;6;Downloading${OSC_PROGRESS_ST}`)
    vi.useRealTimers()
  })

  test('refreshing progress clears the prior stall timer', () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(global, 'clearTimeout')
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      stallAfterMs: 500,
      write: () => {},
    })

    osc.setPercent('Downloading', 1)
    osc.setPercent('Downloading', 2)
    expect(clearSpy).toHaveBeenCalled()

    clearSpy.mockRestore()
    vi.useRealTimers()
  })

  test('done emits 100 then clears after delay', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      clearDelayMs: 200,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 42)
    osc.done()
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}1;100;Downloading${OSC_PROGRESS_ST}`)

    vi.advanceTimersByTime(200)
    expect(writes[2]).toBe(`${OSC_PROGRESS_PREFIX}0;0;Downloading${OSC_PROGRESS_ST}`)
    vi.useRealTimers()
  })

  test('done refresh clears pending clear timer', () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(global, 'clearTimeout')
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      clearDelayMs: 500,
      write: () => {},
    })

    osc.setPercent('Downloading', 1)
    osc.done()
    osc.done()
    expect(clearSpy).toHaveBeenCalled()

    clearSpy.mockRestore()
    vi.useRealTimers()
  })

  test('fail emits error then clears after delay', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      clearDelayMs: 200,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 42)
    osc.fail()
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}2;42;Downloading${OSC_PROGRESS_ST}`)

    vi.advanceTimersByTime(200)
    expect(writes[2]).toBe(`${OSC_PROGRESS_PREFIX}0;0;Downloading${OSC_PROGRESS_ST}`)
    vi.useRealTimers()
  })

  test('fail in indeterminate mode omits percent', () => {
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      clearDelayMs: 0,
      write: (data) => writes.push(data),
    })

    osc.setIndeterminate('Waiting')
    osc.fail()
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}2;;Waiting${OSC_PROGRESS_ST}`)
  })

  test('autoClearOnExit clears progress', () => {
    const writes: string[] = []
    let exitHandler: (() => void) | undefined
    const onceSpy = vi.spyOn(process, 'once').mockImplementation((event, handler) => {
      if (event === 'exit') {
        exitHandler = handler as () => void
      }
      return process
    })
    try {
      const osc = createOscProgressController({
        env: { TERM_PROGRAM: 'wezterm' },
        isTty: true,
        autoClearOnExit: true,
        write: (data) => writes.push(data),
      })

      osc.setPercent('Downloading', 1)
      exitHandler?.()

      expect(writes.at(-1)).toBe(`${OSC_PROGRESS_PREFIX}0;0;Downloading${OSC_PROGRESS_ST}`)
    } finally {
      onceSpy.mockRestore()
    }
  })

  test('setPaused emits paused state', () => {
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 12)
    osc.setPaused('Paused')

    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}4;12;Paused${OSC_PROGRESS_ST}`)
  })

  test('setPaused without determinate progress emits indeterminate pause', () => {
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      write: (data) => writes.push(data),
    })

    osc.setIndeterminate('Waiting')
    osc.setPaused('Paused')

    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}4;;Paused${OSC_PROGRESS_ST}`)
  })

  test('stalledLabel supports custom string', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      stallAfterMs: 500,
      stalledLabel: 'Hold',
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 1)
    vi.advanceTimersByTime(500)
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}4;1;Hold${OSC_PROGRESS_ST}`)
    vi.useRealTimers()
  })

  test('stalledLabel supports formatter', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      stallAfterMs: 500,
      stalledLabel: (label) => `Hold ${label}`,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 1)
    vi.advanceTimersByTime(500)
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}4;1;Hold Downloading${OSC_PROGRESS_ST}`)
    vi.useRealTimers()
  })

  test('label changes bypass throttle', () => {
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 1)
    osc.setPercent('Transcoding', 1)
    expect(writes).toHaveLength(2)
  })

  test('done clears immediately when clearDelayMs is 0', () => {
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      clearDelayMs: 0,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 10)
    osc.done()
    expect(writes[1]).toBe(`${OSC_PROGRESS_PREFIX}1;100;Downloading${OSC_PROGRESS_ST}`)
    expect(writes[2]).toBe(`${OSC_PROGRESS_PREFIX}0;0;Downloading${OSC_PROGRESS_ST}`)
  })

  test('done cancels stall timer', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      stallAfterMs: 500,
      clearDelayMs: 0,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 10)
    osc.done()
    vi.advanceTimersByTime(500)
    expect(writes.some((write) => write.startsWith(`${OSC_PROGRESS_PREFIX}4;`))).toBe(false)
    vi.useRealTimers()
  })

  test('stall timer skips emit when paused', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      stallAfterMs: 500,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 10)
    osc.setPaused('Paused')
    const writesAfterPause = writes.length
    vi.advanceTimersByTime(500)
    expect(writes).toHaveLength(writesAfterPause)
    vi.useRealTimers()
  })

  test('clear cancels pending delayed clear', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const osc = createOscProgressController({
      env: { TERM_PROGRAM: 'wezterm' },
      isTty: true,
      clearDelayMs: 500,
      write: (data) => writes.push(data),
    })

    osc.setPercent('Downloading', 10)
    osc.done()
    osc.clear()
    const writesAfterClear = writes.length
    vi.advanceTimersByTime(500)
    expect(writes).toHaveLength(writesAfterClear)
    vi.useRealTimers()
  })

  test('dispose removes exit listener', () => {
    const writes: string[] = []
    let exitHandler: (() => void) | undefined
    const onceSpy = vi.spyOn(process, 'once').mockImplementation((event, handler) => {
      if (event === 'exit') {
        exitHandler = handler as () => void
      }
      return process
    })
    const offSpy = vi.spyOn(process, 'off')

    try {
      const osc = createOscProgressController({
        env: { TERM_PROGRAM: 'wezterm' },
        isTty: true,
        autoClearOnExit: true,
        write: (data) => writes.push(data),
      })

      osc.dispose()
      expect(offSpy).toHaveBeenCalledWith('exit', exitHandler)
    } finally {
      onceSpy.mockRestore()
      offSpy.mockRestore()
    }
  })
})
