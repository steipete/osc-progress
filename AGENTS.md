# Repository Guidelines

## Project Structure & Module Organization

- `src/`: library source (public entrypoint: `src/index.ts`; implementation: `src/oscProgress.ts`).
- `tests/`: Vitest unit tests (`tests/**/*.test.ts`).
- `docs/`: maintenance docs (notably `docs/RELEASING.md`).
- `dist/`: build output (generated; don’t edit or commit).
- `coverage/`: coverage reports (generated; don’t commit).

## Build, Test, and Development Commands

This repo uses Node.js `>= 20` and `pnpm` (see `package.json`).

- `pnpm install`: install deps.
- `pnpm build`: compile TypeScript into `dist/`.
- `pnpm typecheck`: TypeScript typecheck (no emit).
- `pnpm lint`: Biome checks (CI-style; no writes).
- `pnpm format`: format in-place with Biome.
- `pnpm test`: build + run unit tests.
- `pnpm test:coverage`: build + tests + coverage thresholds.
- `pnpm check`: `lint` + `test:coverage` (use before PRs).

## Coding Style & Naming Conventions

- TypeScript, ESM (`"type": "module"`). Keep imports explicit and Node-friendly.
- Formatting/linting: Biome (`biome.jsonc`).
  - 2-space indent, 100 columns, single quotes, semicolons as-needed.
- Public API discipline: export new API from `src/index.ts`; add TSDoc for anything user-facing.
- Naming: functions/vars `camelCase`, types `PascalCase`, constants `SCREAMING_SNAKE_CASE`.

## Testing Guidelines

- Framework: Vitest (`vitest.config.ts`).
- Location/pattern: `tests/**/*.test.ts` (one feature per `describe`).
- Coverage: enforced thresholds (currently 95% across branches/functions/lines/statements).
- Bugfixes: add a regression test that fails before the fix.

## Commit & Pull Request Guidelines

- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `build(deps):`, etc.; optional scopes).
- PRs:
  - include a short “why” + “what changed” summary
  - add/update tests and docs when behavior/API changes
  - keep artifacts out of git (`dist/`, `coverage/`)
  - must be green on `pnpm check`

