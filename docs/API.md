# API reference

`osc-progress` exports its public API from the package root. Progress output defaults to stderr,
and support detection defaults to `process.env` and `process.stderr.isTTY`.

## `supportsOscProgress(env?, isTty?, options?)`

Returns whether emitting OSC 9;4 progress is appropriate. Detection requires a TTY and recognizes:

- `TERM_PROGRAM` containing `ghostty` or `wezterm`, case-insensitively
- `WT_SESSION`, used by Windows Terminal

`options` accepts:

| Option          | Behavior                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------- |
| `disabled`      | Disables progress.                                                                          |
| `force`         | Enables progress for an otherwise unknown terminal. It does not bypass the TTY requirement. |
| `disableEnvVar` | Names an environment variable that disables progress when set to `"1"`.                     |
| `forceEnvVar`   | Names an environment variable that enables progress when set to `"1"`.                      |

`disabled` takes precedence over `force`. The disable environment variable takes precedence over
the force environment variable.

## `startOscProgress(options?)`

Starts a best-effort progress indicator and returns an idempotent `stop(): void` function. When
support detection fails, the returned function is a no-op.

By default, the helper emits a timer-driven `0%` to `99%` progression and never completes by
itself. Calling `stop()` clears the indicator. Set `indeterminate: true` for state `3` without a
percentage.

| Option                         | Default                | Behavior                                                                      |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------- |
| `label`                        | `"Working…"`           | Extra payload appended to the sequence after control bytes are removed.       |
| `targetMs`                     | 10 minutes             | Target duration for the internal `0%` to `99%` ramp; the minimum is 1 second. |
| `write`                        | `process.stderr.write` | Receives each complete OSC sequence.                                          |
| `env`                          | `process.env`          | Environment used for support detection.                                       |
| `isTty`                        | `process.stderr.isTTY` | TTY state used for support detection.                                         |
| `indeterminate`                | `false`                | Emits state `3` without a percentage.                                         |
| `state`                        | `1`                    | Numeric state for determinate updates: `1`, `2`, or `4`.                      |
| `terminator`                   | `"st"`                 | Sequence terminator: `"st"` (`ESC \\`) or `"bel"`.                            |
| `disabled`, `force`            | `false`                | Direct support-detection overrides.                                           |
| `disableEnvVar`, `forceEnvVar` | —                      | Environment-variable names used for detection overrides.                      |

## `createOscProgressController(options?)`

Creates a stateful `OscProgressReporter`. It returns the same method shape with no-op methods when
support detection fails.

| Method                       | Behavior                                                            |
| ---------------------------- | ------------------------------------------------------------------- |
| `setIndeterminate(label)`    | Emits state `3` without a percentage.                               |
| `setPercent(label, percent)` | Emits state `1`; the percentage is rounded and clamped to `0..100`. |
| `setPaused(label)`           | Emits state `4`, retaining the current percentage when determinate. |
| `done(label?)`               | Emits `100%`, then clears after the configured delay.               |
| `fail(label?)`               | Emits state `2`, then clears after the configured delay.            |
| `clear()`                    | Emits state `0` with the most recently supplied label.              |
| `dispose()`                  | Cancels timers and removes the optional process-exit listener.      |

The controller accepts all `startOscProgress()` options plus:

| Option            | Default                | Behavior                                                                         |
| ----------------- | ---------------------- | -------------------------------------------------------------------------------- |
| `stallAfterMs`    | `0`                    | Emits state `4` after this many milliseconds without an update; `0` disables it. |
| `stalledLabel`    | `label + " (stalled)"` | Static label or formatter used for a stalled update.                             |
| `clearDelayMs`    | `150`                  | Delay before `done()` or `fail()` clears; `0` clears immediately.                |
| `autoClearOnExit` | `false`                | Clears progress during the Node.js `exit` event.                                 |

Controller updates are deduplicated and percentage-only changes are throttled to at most about one
update every 150 ms. A state or label change emits immediately.

## Sequence and label helpers

### `sanitizeLabel(label)`

Removes C0 and C1 control bytes, `DEL`, escape bytes, and OSC terminators, then trims surrounding
whitespace. Emitters apply this automatically to labels.

### `findOscProgressSequences(text)`

Returns an array of `{ start, end, raw, terminator }` records for complete OSC 9;4 sequences.
`terminator` is `"st"`, `"bel"`, or `"c1st"`. Unterminated sequences are ignored.

### `stripOscProgress(text)`

Removes OSC 9;4 sequences terminated by `ST`, `BEL`, or C1 `ST`. An unterminated sequence is
removed from its prefix through the end of the string.

### `sanitizeOscProgress(text, keepOsc)`

Returns `text` unchanged when `keepOsc` is `true`; otherwise, returns `stripOscProgress(text)`.

## Constants and types

The package exports the protocol constants `OSC_PROGRESS_PREFIX`, `OSC_PROGRESS_ST`,
`OSC_PROGRESS_BEL`, and `OSC_PROGRESS_C1_ST`.

It also exports these TypeScript types:

- `OscProgressController`
- `OscProgressReporter`
- `OscProgressControllerOptions`
- `OscProgressOptions`
- `OscProgressSequence`
- `OscProgressSupportOptions`
- `OscProgressTerminator`

## OSC 9;4 semantics

The emitted numeric states are:

| State | Meaning                                       |
| ----- | --------------------------------------------- |
| `0`   | Clear or hide progress.                       |
| `1`   | Normal determinate progress.                  |
| `2`   | Error.                                        |
| `3`   | Indeterminate progress.                       |
| `4`   | Paused or warning, depending on the terminal. |

Labels are appended as an extra payload. They are not part of the canonical OSC 9;4 fields, so
some terminals display them and others ignore them. The library exposes state `4` as-is because
terminals do not agree on its interpretation.
