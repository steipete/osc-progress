# ⏳ osc-progress — One tiny lib to emit OSC 9;4 terminal progress.

Tiny TypeScript helper for **OSC 9;4** terminal progress sequences (used by terminals like Ghostty / WezTerm / Windows Terminal).

## Install

```bash
pnpm add osc-progress
```

## Usage

```ts
import process from 'node:process'
import { startOscProgress } from 'osc-progress'

const stop = startOscProgress({
  label: 'Fetching',
  write: (chunk) => process.stderr.write(chunk),
  env: process.env,
  isTty: process.stderr.isTTY,
})

// ...do work...

stop()
```

Indeterminate (spinner-like) mode:

```ts
import { startOscProgress } from 'osc-progress'

const stop = startOscProgress({ label: 'Waiting', indeterminate: true })
// ...
stop()
```

Strip OSC progress from stored logs:

```ts
import { sanitizeOscProgress } from 'osc-progress'

const clean = sanitizeOscProgress(text, /*keepOsc*/ process.stdout.isTTY)
```

## API

### `supportsOscProgress(env?, isTty?, options?)`

Returns `true` when emitting OSC 9;4 progress makes sense.

Heuristics:
- requires a TTY
- enables for `TERM_PROGRAM=ghostty*`, `TERM_PROGRAM=wezterm*`, or `WT_SESSION` (Windows Terminal)

Optional overrides:
- `options.disabled` / `options.force`
- `options.disableEnvVar` / `options.forceEnvVar` (expects `= "1"`)

### `startOscProgress(options?)`

Starts a best-effort progress indicator and returns `stop(): void`.

Notes:
- `label` is appended as extra payload; **not part of the canonical OSC 9;4 spec** (many terminals ignore it, some show it).
- default is a timer-driven `0% → 99%` progression (never completes by itself).
- `terminator` defaults to `st` (`ESC \\`); `bel` is also supported.

### `sanitizeOscProgress(text, keepOsc)`

Removes OSC 9;4 progress sequences (terminated by `BEL`, `ST` (`ESC \\`), or `0x9c`).

## Semantics / portability

OSC 9;4 is widely implemented, but state `4` is ambiguous across terminals (some treat it as `paused`, some as `warning`).
This library exposes the raw numeric state and does not try to reinterpret it.
