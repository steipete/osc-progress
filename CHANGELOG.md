# Changelog

All notable changes to this project are documented in this file.

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
