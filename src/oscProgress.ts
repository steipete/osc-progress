import process from "node:process";
import {
  OSC_PROGRESS_PREFIX,
  OSC_PROGRESS_ST,
  OSC_PROGRESS_BEL,
  sanitizeLabel,
} from "./sequences.js";

export {
  OSC_PROGRESS_PREFIX,
  OSC_PROGRESS_ST,
  OSC_PROGRESS_BEL,
  OSC_PROGRESS_C1_ST,
  type OscProgressSequence,
  sanitizeLabel,
  findOscProgressSequences,
  stripOscProgress,
  sanitizeOscProgress,
} from "./sequences.js";

const DEFAULT_TARGET_MS = 10 * 60_000;
const DEFAULT_THROTTLE_INTERVAL_MS = 150;
const DEFAULT_CLEAR_DELAY_MS = 150;

/** How to terminate the OSC sequence when emitting. */
export type OscProgressTerminator = "st" | "bel";

export interface OscProgressSupportOptions {
  /** Force support on/off, overriding env heuristics. */
  force?: boolean;
  disabled?: boolean;
  /** Name of env var which disables OSC progress when set to `"1"`. */
  disableEnvVar?: string;
  /** Name of env var which forces OSC progress when set to `"1"`. */
  forceEnvVar?: string;
}

export interface OscProgressOptions extends OscProgressSupportOptions {
  /**
   * Extra payload appended to the OSC sequence (many terminals ignore this; a few show it).
   * Defaults to `"Working…"`. Sanitized to avoid control chars and terminators.
   */
  label?: string;
  /**
   * Target duration in ms for the internal `0 → 99%` ramp.
   * Defaults to 10 minutes, including for NaN; the minimum is 1 second.
   * The implementation never emits 100% by itself; completion is via `stop()`.
   */
  targetMs?: number;
  /** Write function (defaults to `process.stderr.write`). */
  write?: (data: string) => void;
  /** Environment lookup (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** TTY flag (defaults to `process.stderr.isTTY`, matching the default writer). */
  isTty?: boolean;
  /** When true, emit an indeterminate progress indicator (no percentage). */
  indeterminate?: boolean;
  /**
   * Numeric OSC 9;4 state.
   * - 0: clear/hide
   * - 1: normal
   * - 2: error
   * - 3: indeterminate
   * - 4: ambiguous (paused/warning depending on terminal)
   */
  state?: 1 | 2 | 4;
  /** OSC terminator to use. `st` = ESC \\, `bel` = BEL. */
  terminator?: OscProgressTerminator;
}

export interface OscProgressControllerOptions extends OscProgressOptions {
  /**
   * Emit a stalled state when no updates arrive within this window.
   * Set to 0 to disable (default).
   */
  stallAfterMs?: number;
  /** Customize the stalled label or formatter. Defaults to appending " (stalled)". */
  stalledLabel?: string | ((label: string) => string);
  /**
   * Delay (ms) between done/fail and clearing the progress indicator.
   * Set to 0 for immediate clear.
   */
  clearDelayMs?: number;
  /** Clear progress on process exit. */
  autoClearOnExit?: boolean;
}

function resolveTerminator(terminator: OscProgressTerminator | undefined): string {
  return terminator === "bel" ? OSC_PROGRESS_BEL : OSC_PROGRESS_ST;
}

export type OscProgressController = {
  /** Emit an indeterminate progress indicator. */
  setIndeterminate: (label: string) => void;
  /** Emit a determinate progress indicator. */
  setPercent: (label: string, percent: number) => void;
  /** Clear/hide the progress indicator. */
  clear: () => void;
};

export type OscProgressReporter = OscProgressController & {
  /** Emit a paused/stalled progress indicator (state=4). */
  setPaused: (label: string) => void;
  /** Emit 100% then clear after the configured delay. */
  done: (label?: string) => void;
  /** Emit error state then clear after the configured delay. */
  fail: (label?: string) => void;
  /** Dispose timers/listeners created by this controller. */
  dispose: () => void;
};

/**
 * Best-effort check whether OSC 9;4 progress output is likely to work.
 *
 * Default heuristics:
 * - requires `isTty === true`
 * - enables for Ghostty (`TERM_PROGRAM=ghostty*`), WezTerm (`TERM_PROGRAM=wezterm*`),
 *   Canario (`TERM_PROGRAM=canario*`), or Windows Terminal (`WT_SESSION`)
 *
 * Override knobs:
 * - `options.force` / `options.disabled`
 * - `options.forceEnvVar` / `options.disableEnvVar` (expects value `"1"`)
 */
export function supportsOscProgress(
  env: NodeJS.ProcessEnv = process.env,
  isTty: boolean = process.stderr.isTTY,
  options: OscProgressSupportOptions = {},
): boolean {
  if (!isTty) return false;
  if (options.disabled) return false;
  if (options.force) return true;

  if (options.disableEnvVar && env[options.disableEnvVar] === "1") {
    return false;
  }
  if (options.forceEnvVar && env[options.forceEnvVar] === "1") {
    return true;
  }

  const termProgram = (env.TERM_PROGRAM ?? "").toLowerCase();
  if (termProgram.includes("ghostty")) return true;
  if (termProgram.includes("wezterm")) return true;
  if (termProgram.includes("canario")) return true;
  if (env.WT_SESSION) return true;
  return false;
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
    label = "Working…",
    targetMs = DEFAULT_TARGET_MS,
    write = (text) => process.stderr.write(text),
    indeterminate = false,
    state = 1,
    terminator,
  } = options;
  if (!supportsOscProgress(options.env, options.isTty, options)) {
    return () => {};
  }

  const cleanLabel = sanitizeLabel(label);
  const end = resolveTerminator(terminator);
  let stopped = false;

  const send = (st: number, percent: number | null): void => {
    if (percent == null) {
      write(`${OSC_PROGRESS_PREFIX}${st};;${cleanLabel}${end}`);
      return;
    }
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    write(`${OSC_PROGRESS_PREFIX}${st};${clamped};${cleanLabel}${end}`);
  };

  if (indeterminate) {
    send(3, null);
    return () => {
      if (stopped) return;
      stopped = true;
      send(0, 0);
    };
  }

  const target = Math.max(Number.isNaN(targetMs) ? DEFAULT_TARGET_MS : targetMs, 1_000);
  const startedAt = performance.now();
  send(state, 0);

  const timer = setInterval(() => {
    const elapsed = performance.now() - startedAt;
    const percent = Math.min(99, (elapsed / target) * 100);
    send(state, percent);
  }, 900);
  timer.unref();

  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    send(0, 0);
  };
}

/**
 * Creates a small stateful controller for OSC 9;4 progress output.
 *
 * Useful when you want to drive progress updates yourself (e.g. bytes downloaded / total bytes,
 * or seconds processed / total duration) and switch between indeterminate and determinate modes.
 *
 * Behavior:
 * - no-op controller when `supportsOscProgress(...)` is false
 * - `setIndeterminate(label)` emits `state=3`
 * - `setPercent(label, percent)` emits `state=1` with a clamped integer percent
 * - `clear()` emits `state=0` using the last label
 */
export function createOscProgressController(
  options: OscProgressControllerOptions = {},
): OscProgressReporter {
  const {
    label = "Working…",
    write = (text) => process.stderr.write(text),
    terminator,
    stallAfterMs = 0,
    stalledLabel,
    clearDelayMs = DEFAULT_CLEAR_DELAY_MS,
    autoClearOnExit = false,
  } = options;

  if (!supportsOscProgress(options.env, options.isTty, options)) {
    return {
      setIndeterminate: () => {},
      setPercent: () => {},
      setPaused: () => {},
      done: () => {},
      fail: () => {},
      clear: () => {},
      dispose: () => {},
    };
  }

  const end = resolveTerminator(terminator);

  const resolveStalledLabel = (baseLabel: string): string => {
    if (typeof stalledLabel === "function") return stalledLabel(baseLabel);
    if (typeof stalledLabel === "string") return stalledLabel;
    return `${baseLabel} (stalled)`;
  };

  const normalizePercent = (percent: number): number => {
    if (Number.isNaN(percent)) return 0;
    return Math.max(0, Math.min(100, Math.round(percent)));
  };

  let lastEmittedLabel = label;
  let lastEmittedPercent: number | null = null;
  let lastEmittedState: number | null = null;
  let lastEmitAt = 0;

  let lastSeenLabel = label;
  let lastSeenPercent: number | null = null;

  let stallTimer: NodeJS.Timeout | null = null;
  let clearTimer: NodeJS.Timeout | null = null;
  let updateTimer: NodeJS.Timeout | null = null;

  const clearUpdateTimer = () => {
    if (updateTimer !== null) {
      clearTimeout(updateTimer);
      updateTimer = null;
    }
  };

  const cancelPendingClear = (): boolean => {
    if (clearTimer === null) return false;
    clearTimeout(clearTimer);
    clearTimer = null;
    return true;
  };

  const clearStallTimer = () => {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  };

  const clearTimers = () => {
    clearStallTimer();
    cancelPendingClear();
    clearUpdateTimer();
  };

  const scheduleStall = () => {
    if (!stallAfterMs || stallAfterMs <= 0) return;
    if (stallTimer !== null) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stallTimer = null;
      const labelToUse = resolveStalledLabel(lastSeenLabel);
      const percent = lastSeenPercent;
      send(4, percent, labelToUse, true);
    }, stallAfterMs);
    stallTimer.unref();
  };

  const scheduleClear = () => {
    if (clearDelayMs <= 0) {
      clear();
      return;
    }
    if (clearTimer !== null) clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      clearTimer = null;
      clear();
    }, clearDelayMs);
    clearTimer.unref();
  };

  const send = (state: number, percent: number | null, nextLabel: string, force = false) => {
    const cleanLabel = sanitizeLabel(nextLabel);
    const normalizedPercent = percent == null ? null : normalizePercent(percent);
    const now = performance.now();
    const stateChanged = state !== lastEmittedState;
    const labelChanged = cleanLabel !== lastEmittedLabel;
    const percentChanged = normalizedPercent !== lastEmittedPercent;
    const withinInterval = now - lastEmitAt < DEFAULT_THROTTLE_INTERVAL_MS;

    let shouldEmit = force || stateChanged || labelChanged;
    if (!shouldEmit && percentChanged) {
      shouldEmit = !withinInterval;
    }
    clearUpdateTimer();
    if (!shouldEmit) {
      if (percentChanged) {
        // Keep the latest value without extending the current throttle window.
        updateTimer = setTimeout(
          () => {
            updateTimer = null;
            send(state, normalizedPercent, cleanLabel, true);
          },
          Math.ceil(DEFAULT_THROTTLE_INTERVAL_MS - (now - lastEmitAt)),
        );
        updateTimer.unref();
      }
      return;
    }

    if (normalizedPercent == null) {
      write(`${OSC_PROGRESS_PREFIX}${state};;${cleanLabel}${end}`);
    } else {
      write(`${OSC_PROGRESS_PREFIX}${state};${normalizedPercent};${cleanLabel}${end}`);
    }
    lastEmittedLabel = cleanLabel;
    lastEmittedPercent = normalizedPercent;
    lastEmittedState = state;
    lastEmitAt = now;
  };

  // Remember the last user-provided label so `clear()` clears the most recent task label.
  const updateSeen = (nextLabel: string, percent: number | null, shouldScheduleStall = true) => {
    lastSeenLabel = nextLabel;
    lastSeenPercent = percent;
    if (shouldScheduleStall) {
      scheduleStall();
    }
  };

  const setIndeterminate = (nextLabel: string) => {
    const resumed = cancelPendingClear();
    updateSeen(nextLabel, null);
    send(3, null, nextLabel, resumed);
  };

  const setPercent = (nextLabel: string, percent: number) => {
    const resumed = cancelPendingClear();
    const normalized = normalizePercent(percent);
    updateSeen(nextLabel, normalized);
    send(1, normalized, nextLabel, resumed);
  };

  const setPaused = (nextLabel: string) => {
    cancelPendingClear();
    clearStallTimer();
    const percent = lastSeenPercent;
    updateSeen(nextLabel, percent, false);
    send(4, percent, nextLabel, true);
  };

  const clear = () => {
    clearTimers();
    send(0, 0, lastSeenLabel, true);
  };

  const done = (nextLabel?: string) => {
    const labelToUse = nextLabel ?? lastSeenLabel;
    clearStallTimer();
    updateSeen(labelToUse, 100, false);
    send(1, 100, labelToUse, true);
    scheduleClear();
  };

  const fail = (nextLabel?: string) => {
    const labelToUse = nextLabel ?? lastSeenLabel;
    const percent = lastSeenPercent;
    clearStallTimer();
    updateSeen(labelToUse, percent, false);
    send(2, percent, labelToUse, true);
    scheduleClear();
  };

  if (autoClearOnExit) {
    process.once("exit", clear);
  }

  const dispose = () => {
    clearTimers();
    if (autoClearOnExit) {
      process.off("exit", clear);
    }
  };

  return { setIndeterminate, setPercent, setPaused, done, fail, clear, dispose };
}
