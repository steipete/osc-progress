# Changelog
All notable changes to this project are documented in this file.

## 0.1.1 - Unreleased
### Changed
- TBD

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
