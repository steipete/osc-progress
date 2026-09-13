# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### Fixed

- Scan and strip large captured terminal logs in linear time while preserving mixed terminators, incomplete-sequence removal, and prefixes joined across removed frames.

- Keep timer-driven progress and controller throttling steady across system-clock changes, and use the default ramp duration for `NaN` instead of emitting invalid percentages.

### Changed

- Upgrade Vitest and V8 coverage to 5.0.0; run strict-engine CI on Node.js 24 and 26, dropping the unsupported odd, non-LTS Node.js 25 toolchain while retaining the package's Node.js >=24 engine floor.
- Refresh transitive tooling dependencies, including Rolldown 1.2.8, Oxc types 0.149.0, coverage helpers, Nano ID, obug, and tinyexec.
- Refresh Node.js 24 types, Oxfmt, Oxlint, PostCSS, Vite, Vitest 4, and the dependency lockfile while retaining Node.js 24+ support and pnpm 11.26.0. (`#39`, thanks `@dependabot`)
- Validate strict dependency engine compatibility, tests, and compiled-package smoke checks on Node.js 24, 25, and 26 in CI.
- Keep the development toolchain on the patched esbuild 0.28.2 security override.

## 0.3.3 - 2026-08-13

### Fixed

- Recognize Canario as supporting OSC 9;4 progress. (`#33`, thanks `@hugows`)

## 0.3.2 - 2026-07-04

### Fixed

- Match default TTY detection to the default stderr writer and make indeterminate stop calls idempotent.
- Cancel delayed completion clears when a controller starts new progress and clamp `NaN` percentages to a valid frame.
- Strip all C0, C1, and DEL control bytes from labels while preserving printable punctuation.

## 0.3.1 - 2026-06-10

### Fixed

- Add a package export `default` condition so CJS-style resolvers can find the ESM entrypoint. (`#8`, thanks `@grimmjoww`)
- Strip control characters from OSC progress labels so labels cannot break emitted progress sequences. (`#15`, thanks `@devYRPauli`)

## 0.3.0 - 2026-01-20

### Added

- Throttled/deduped OSC progress updates (default).
- Stalled/paused state support (`setPaused`, `stallAfterMs`).
- Completion/error helpers (`done`, `fail`) with delayed clear (`clearDelayMs`).
- Optional auto-clear on process exit (`autoClearOnExit`).
- Controller cleanup via `dispose()`.

### Changed

- `createOscProgressController` now returns an extended controller with pause/done/fail helpers.
- Controller updates are throttled by default (behavior change).

## 0.2.0 - 2025-12-25

### Added

- `createOscProgressController` for stateful determinate/indeterminate updates.

## 0.1.0 - 2025-12-19

### Added

- OSC 9;4 progress emitter (`startOscProgress`) with determinate (`0% → 99%`) and indeterminate modes.
- Terminal support detection (`supportsOscProgress`) with safe defaults (TTY-only) and heuristics for Ghostty / WezTerm / Windows Terminal.
- Environment overrides (`force`/`disabled` and `forceEnvVar`/`disableEnvVar`).
- OSC 9;4 stripping/sanitizing helpers (`stripOscProgress`, `sanitizeOscProgress`) for log storage.
- Sequence finder (`findOscProgressSequences`) supporting ST (`ESC \\`), BEL, and C1 ST terminators.
- Label sanitization (`sanitizeLabel`) to prevent control/terminator injection.
- Modern TypeScript ESM package with bundled types, Node 20+.
- Test suite with full coverage for core behavior.
