# Release Checklist (npm)

Rule: every release = **npm publish + git tag + GitHub release** (always do all three).

## 1) Version & changelog

- [ ] Choose the next version from the unreleased changes.
- [ ] Update `package.json` version.
- [ ] Update `CHANGELOG.md` (product-facing bullets only).
- [ ] `pnpm install` (keep `pnpm-lock.yaml` current).

## 2) Validate

- [ ] `pnpm check` (Oxfmt, Oxlint, typecheck, and tests; must be warning-free).

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
- [ ] Use the maintainer's existing npm login and approved credential storage. Do not put tokens in shell profiles or commit them to npm configuration.
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
  - write the changelog bullets and release proof to `/tmp/osc-progress-release.md`, then inspect it
  - `gh release create v<version> --title "<version>" --notes-file /tmp/osc-progress-release.md`

## 6) Verify (post)

- [ ] `npm view osc-progress@<version> version dist-tags dist.tarball dist.integrity time --json`
- [ ] Confirm `latest`, tarball, integrity, and publish time all match the published version.
- [ ] Confirm GitHub tag + Release exist and point to the published commit.
- [ ] Confirm the Release body contains the changelog notes plus links to the npm version page, registry tarball, integrity, and CI/proof.
- [ ] Open a new `## Unreleased` section, commit, and push the release closeout.
