# Release Checklist (npm)

## 1) Version & changelog
- [ ] Decide the next version (start at `0.1.0`, then `0.1.1`, etc).
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
- [ ] Confirm npm session: `npm whoami` (and 2FA readiness).
- [ ] Publish: `npm publish`
- [ ] Verify registry: `npm view osc-progress version`

## 5) Tag + GitHub release
- [ ] `git tag v<version> && git push origin v<version>`
- [ ] Create GitHub release for tag `v<version>` (title = `<version>`; body = changelog bullets for that version).
