import process from 'node:process'

/**
 * OSC 9;4 progress prefix (`ESC ] 9 ; 4 ;`).
 *
 * Typical emitted forms:
 * - `ESC ] 9;4;<state>;<percent>;<payload> ST`
 * - `ESC ] 9;4;<state>;;<payload> ST` (indeterminate)
 */
export const OSC_PROGRESS_PREFIX = '\u001b]9;4;'
/** String Terminator (ST): `ESC \\` */
export const OSC_PROGRESS_ST = '\u001b\\'
/** Bell (BEL): `0x07` */
export const OSC_PROGRESS_BEL = '\u0007'
/** C1 String Terminator (ST): `0x9c` */
export const OSC_PROGRESS_C1_ST = '\u009c'

/** How to terminate the OSC sequence when emitting. */
export type OscProgressTerminator = 'st' | 'bel'

export interface OscProgressSupportOptions {
  /** Force support on/off, overriding env heuristics. */
  force?: boolean
  disabled?: boolean
  /** Name of env var which disables OSC progress when set to `"1"`. */
  disableEnvVar?: string
  /** Name of env var which forces OSC progress when set to `"1"`. */
  forceEnvVar?: string
}

export interface OscProgressOptions extends OscProgressSupportOptions {
  /**
   * Extra payload appended to the OSC sequence (many terminals ignore this; a few show it).
   * Defaults to `"Working…"`. Sanitized to avoid control chars and terminators.
   */
  label?: string
  /**
   * Target duration in ms for the internal `0 → 99%` ramp.
   * The implementation never emits 100% by itself; completion is via `stop()`.
   */
  targetMs?: number
  /** Write function (defaults to `process.stderr.write`). */
  write?: (data: string) => void
  /** Environment lookup (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv
  /** TTY flag (defaults to `process.stdout.isTTY`). */
  isTty?: boolean
  /** When true, emit an indeterminate progress indicator (no percentage). */
  indeterminate?: boolean
  /**
   * Numeric OSC 9;4 state.
   * - 0: clear/hide
   * - 1: normal
   * - 2: error
   * - 3: indeterminate
   * - 4: ambiguous (paused/warning depending on terminal)
   */
  state?: 1 | 2 | 4
  /** OSC terminator to use. `st` = ESC \\, `bel` = BEL. */
  terminator?: OscProgressTerminator
}

export interface OscProgressSequence {
  /** Inclusive start index in the input string. */
  start: number
  /** Exclusive end index in the input string. */
  end: number
  /** Raw substring that matched. */
  raw: string
  /** Which terminator was encountered. */
  terminator: 'st' | 'bel' | 'c1st'
}

function resolveTerminator(terminator: OscProgressTerminator | undefined): string {
  return terminator === 'bel' ? OSC_PROGRESS_BEL : OSC_PROGRESS_ST
}

/**
 * Sanitizes a label/payload so it can't break the surrounding OSC sequence.
 * Removes escape chars and common OSC terminators; trims whitespace.
 */
export function sanitizeLabel(label: string): string {
  const withoutSt = label.replaceAll(OSC_PROGRESS_ST, '')
  const withoutEscape = withoutSt.split('\u001b').join('')
  const withoutTerminators = withoutEscape
    .replaceAll(OSC_PROGRESS_BEL, '')
    .replaceAll(OSC_PROGRESS_C1_ST, '')
  return withoutTerminators.replaceAll(']', '').trim()
}

/**
 * Best-effort check whether OSC 9;4 progress output is likely to work.
 *
 * Default heuristics:
 * - requires `isTty === true`
 * - enables for Ghostty (`TERM_PROGRAM=ghostty*`), WezTerm (`TERM_PROGRAM=wezterm*`), Windows Terminal (`WT_SESSION`)
 *
 * Override knobs:
 * - `options.force` / `options.disabled`
 * - `options.forceEnvVar` / `options.disableEnvVar` (expects value `"1"`)
 */
export function supportsOscProgress(
  env: NodeJS.ProcessEnv = process.env,
  isTty: boolean = process.stdout.isTTY,
  options: OscProgressSupportOptions = {}
): boolean {
  if (!isTty) return false
  if (options.disabled) return false
  if (options.force) return true

  if (options.disableEnvVar && env[options.disableEnvVar] === '1') {
    return false
  }
  if (options.forceEnvVar && env[options.forceEnvVar] === '1') {
    return true
  }

  const termProgram = (env.TERM_PROGRAM ?? '').toLowerCase()
  if (termProgram.includes('ghostty')) return true
  if (termProgram.includes('wezterm')) return true
  if (env.WT_SESSION) return true
  return false
}

/**
 * Finds OSC 9;4 progress sequences inside an arbitrary string.
 *
 * Supports three terminators:
 * - ST (`ESC \\`)
 * - BEL (`0x07`)
 * - C1 ST (`0x9c`)
 *
 * Unterminated sequences are ignored (use `stripOscProgress` if you want to drop them).
 */
export function findOscProgressSequences(text: string): OscProgressSequence[] {
  const sequences: OscProgressSequence[] = []
  const prefixLen = OSC_PROGRESS_PREFIX.length
  let searchFrom = 0
  while (searchFrom < text.length) {
    const start = text.indexOf(OSC_PROGRESS_PREFIX, searchFrom)
    if (start === -1) break

    const after = start + prefixLen
    const candidates: Array<{
      endExclusive: number
      terminator: OscProgressSequence['terminator']
    }> = []

    const stStart = text.indexOf(OSC_PROGRESS_ST, after)
    if (stStart !== -1) {
      candidates.push({ endExclusive: stStart + OSC_PROGRESS_ST.length, terminator: 'st' })
    }
    const belStart = text.indexOf(OSC_PROGRESS_BEL, after)
    if (belStart !== -1) {
      candidates.push({ endExclusive: belStart + OSC_PROGRESS_BEL.length, terminator: 'bel' })
    }
    const c1Start = text.indexOf(OSC_PROGRESS_C1_ST, after)
    if (c1Start !== -1) {
      candidates.push({ endExclusive: c1Start + OSC_PROGRESS_C1_ST.length, terminator: 'c1st' })
    }

    if (candidates.length === 0) {
      searchFrom = after
      continue
    }

    candidates.sort((a, b) => a.endExclusive - b.endExclusive)
    const best = candidates[0]
    sequences.push({
      start,
      end: best.endExclusive,
      raw: text.slice(start, best.endExclusive),
      terminator: best.terminator,
    })
    searchFrom = best.endExclusive
  }
  return sequences
}

/**
 * Removes OSC 9;4 progress sequences from `text`.
 *
 * Behavior:
 * - strips sequences terminated by ST/BEL/C1 ST
 * - if a sequence is unterminated, it is removed until end-of-string
 */
export function stripOscProgress(text: string): string {
  const prefixLen = OSC_PROGRESS_PREFIX.length
  let current = text
  while (current.includes(OSC_PROGRESS_PREFIX)) {
    const start = current.indexOf(OSC_PROGRESS_PREFIX)
    const after = start + prefixLen

    const stStart = current.indexOf(OSC_PROGRESS_ST, after)
    const belStart = current.indexOf(OSC_PROGRESS_BEL, after)
    const c1Start = current.indexOf(OSC_PROGRESS_C1_ST, after)

    const ends: number[] = []
    if (stStart !== -1) ends.push(stStart + OSC_PROGRESS_ST.length)
    if (belStart !== -1) ends.push(belStart + OSC_PROGRESS_BEL.length)
    if (c1Start !== -1) ends.push(c1Start + OSC_PROGRESS_C1_ST.length)

    const cutEnd = ends.length === 0 ? current.length : Math.min(...ends)
    current = `${current.slice(0, start)}${current.slice(cutEnd)}`
  }
  return current
}

/**
 * Convenience helper:
 * - if `keepOsc` is true, returns the input unchanged (useful when writing to a TTY)
 * - otherwise, strips OSC 9;4 sequences (useful for logs/snapshots)
 */
export function sanitizeOscProgress(text: string, keepOsc: boolean): string {
  return keepOsc ? text : stripOscProgress(text)
}

/**
 * Emits a terminal progress indicator using OSC 9;4 and returns `stop()`.
 *
 * Notes:
 * - no-op when `supportsOscProgress(...)` is false
 * - determinate mode ramps `0% → 99%` on a timer; `stop()` clears progress
 * - indeterminate mode emits `state=3` and `stop()` clears progress
 */
export function startOscProgress(options: OscProgressOptions = {}): () => void {
  const {
    label = 'Working…',
    targetMs = 10 * 60_000,
    write = (text) => process.stderr.write(text),
    indeterminate = false,
    state = 1,
    terminator,
  } = options
  if (!supportsOscProgress(options.env, options.isTty, options)) {
    return () => {}
  }

  const cleanLabel = sanitizeLabel(label)
  const end = resolveTerminator(terminator)

  const send = (st: number, percent: number | null): void => {
    if (percent == null) {
      write(`${OSC_PROGRESS_PREFIX}${st};;${cleanLabel}${end}`)
      return
    }
    const clamped = Math.max(0, Math.min(100, Math.round(percent)))
    write(`${OSC_PROGRESS_PREFIX}${st};${clamped};${cleanLabel}${end}`)
  }

  if (indeterminate) {
    send(3, null)
    return () => {
      send(0, 0)
    }
  }

  const target = Math.max(targetMs, 1_000)
  const startedAt = Date.now()
  send(state, 0)

  const timer = setInterval(() => {
    const elapsed = Date.now() - startedAt
    const percent = Math.min(99, (elapsed / target) * 100)
    send(state, percent)
  }, 900)
  timer.unref?.()

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
    send(0, 0)
  }
}
