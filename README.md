# osc-progress ⏳ — Tiny progress, right in the tab.

[![CI](https://img.shields.io/github/actions/workflow/status/steipete/osc-progress/ci.yml?branch=main&style=flat-square&label=ci)](https://github.com/steipete/osc-progress/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/osc-progress?style=flat-square)](https://www.npmjs.com/package/osc-progress)
[![Node](https://img.shields.io/node/v/osc-progress?style=flat-square)](https://nodejs.org)
[![License](https://img.shields.io/github/license/steipete/osc-progress?style=flat-square)](LICENSE)

`osc-progress` is a TypeScript library for emitting and removing OSC 9;4 terminal progress
sequences. It is intended for Node.js CLIs running in Ghostty, WezTerm, Canario, or Windows
Terminal and becomes a no-op outside supported TTYs.

## Install

```sh
pnpm add osc-progress
```

Node.js 24 or newer is required.

## Quick start

```ts
import { setTimeout as delay } from "node:timers/promises";
import { startOscProgress } from "osc-progress";

const stop = startOscProgress({ label: "Indexing", indeterminate: true });
try {
  await delay(1_000);
} finally {
  stop();
}
```

`startOscProgress()` writes to stderr by default. In a supported terminal it starts progress and
returns an idempotent function that clears it; elsewhere both operations do nothing.

## Report real progress

Use a controller when the work already exposes a percentage or moves between states:

```ts
import { createOscProgressController } from "osc-progress";

const progress = createOscProgressController({ stallAfterMs: 10_000 });
progress.setIndeterminate("Connecting");
progress.setPercent("Downloading", 42);
progress.done();
```

Updates are deduplicated and throttled to about one every 150 ms. Percentages are rounded and
clamped to `0..100`; `done()` and `fail()` emit their final state before clearing it.

## Detection and overrides

Progress is enabled only for a TTY recognized as Ghostty, WezTerm, Canario, or Windows Terminal. The same
detection applies to both `startOscProgress()` and `createOscProgressController()`.

```ts
import { supportsOscProgress } from "osc-progress";

const supported = supportsOscProgress(process.env, process.stderr.isTTY === true, {
  forceEnvVar: "MY_CLI_FORCE_PROGRESS",
  disableEnvVar: "MY_CLI_NO_PROGRESS",
});
```

The named environment variables take effect when their value is `"1"`. Direct `force` and
`disabled` options are also available; a non-TTY stream always remains disabled.

## Clean stored output

Remove progress control sequences before saving captured terminal output:

```ts
import { sanitizeOscProgress } from "osc-progress";

function prepareForStorage(output: string): string {
  return sanitizeOscProgress(output, process.stdout.isTTY === true);
}
```

The parser recognizes sequences terminated by `BEL`, `ST` (`ESC \\`), or C1 `ST` (`0x9c`).

## API and terminal behavior

The public API includes the timer-based helper, a stateful controller, support detection, label
sanitization, sequence discovery, and stripping helpers. See the [API reference](docs/API.md) for
signatures, options, exported constants, and OSC 9;4 portability notes.

OSC 9;4 state `4` is interpreted as paused by some terminals and warning by others. The library
emits the numeric state without trying to normalize that terminal-specific behavior. Labels are
an extra payload outside the canonical OSC 9;4 fields, so terminals may ignore them.

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm check
```

`pnpm check` runs formatting, linting, typechecking, tests, and coverage thresholds.

## License

MIT. See [LICENSE](LICENSE).
