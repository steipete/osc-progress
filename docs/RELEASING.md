# Release Checklist (npm)

Rule: every release = **npm publish + git tag + GitHub release** (always do all three).

## 1) Version & changelog
- [ ] Decide the next version (start at `0.1.0`, then increment as needed).
- [ ] Update `package.json` version.
- [ ] Update `CHANGELOG.md` (product-facing bullets only).
- [ ] `pnpm install` (keep `pnpm-lock.yaml` current).

## 2) Validate
- [ ] `pnpm check` (Biome + tests; must be warning-free).

## 3) Build + inspect artifact
- [ ] `pnpm build` (ensure `dist/` is current).
- [ ] `npm pack --pack-destination /tmp`
- [ ] Inspect tarball contents (no junk):
  - `tar -tf /tmp/osc-progress-<version>.tgz`

## 4) Publish
- [ ] Ensure git status is clean; commit + push.
- [ ] Confirm registry + auth:
  - `npm ping`
  - `npm whoami`
- [ ] Avoid browser auth prompts (recommended):
  - Create a **granular access token** with **write** + **Bypass 2FA** at npmjs.com/settings/~/tokens.
  - Export it in `~/.profile` (e.g. `export NPM_TOKEN=...`) and wire it in `~/.npmrc`:
    - `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`
  - If `npm publish` still prompts for browser auth, the token wasn’t loaded; rerun from a shell that has `NPM_TOKEN` (e.g. `source ~/.profile`).
- [ ] Publish:
  - `pnpm publish --access public --tag latest`
  - If npm requires 2FA OTP: add `--otp <code>`
- [ ] Verify registry:
  - `npm view osc-progress version`
  - `npm view osc-progress dist-tags --json`

## 5) Tag + GitHub release (always)
- [ ] Ensure tag points at the published commit:
  - `git tag v<version>`
  - `git push origin v<version>`
- [ ] Create GitHub release for tag `v<version>`:
  - title = `<version>` (just the version)
  - body = changelog bullets for that version
  - `gh release create v<version> --title "<version>" --notes "<paste bullets>"`

## 6) Verify (post)
- [ ] `npm view osc-progress time --json`
- [ ] `gh release view v<version>`
