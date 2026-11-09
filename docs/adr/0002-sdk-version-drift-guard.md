# 0002: SDK version drift guard

9 Nov 2026 · item cli-sdk-versions

## Problem
`strait init` and `strait events add` write the SDK versions in `src/install.mjs` VERSIONS. They are bumped by
hand; on 9 Nov all four were behind (React Native 0.11.0 vs 0.11.3, Flutter 0.10.2 vs 0.10.6, iOS 0.11.1 vs 0.11.4,
Android 0.10.1 vs 0.10.4), so a new developer started without the install campaign tags, the SDK naming itself
and iPhone IPv4/IPv6 matching. Five hand bumps in one week (0.2.1 to 0.3.2) show it will keep happening.

## Who it serves
The developer whose first command is `npx @straitlink/cli init`: they should get today's SDK, every time.

## Options
- **Do nothing / bump by hand.** Already failed.
- **Resolve "latest compatible" at runtime, offline fallback.** Always current even for an old CLI, but adds
  network calls (npm, pub.dev, GitHub, JitPack) to `init`, a timeout path, non-deterministic output and tests,
  and writes code against an SDK version the templates were never tested with. Rejected: more moving parts
  on the first command a developer runs.
- **CI drift check (chosen).** `scripts/check-sdk-versions.mjs` compares each pin with the latest its registry
  serves (npm `latest`, pub.dev `latest`, highest `vX.Y.Z` git tag for SwiftPM and JitPack, plus the JitPack
  build of that tag) and exits 1 on any difference. It runs on every push/PR, daily (cron) and in
  `release.yml` before `npm publish`, so a CLI that installs an old SDK can't be released and a newly
  released SDK turns CI red within a day (the tech map probe shows CI status). Tests read VERSIONS, so a bump
  is a one-file edit. Not shipped in the npm package (`files` = bin/, src/).

## Security
Read-only GETs to public registries and `git ls-remote` of public repos; no token, no secrets. A compromised
registry answer can only make CI red (it never writes anything); the bump stays a reviewed PR.

## Architecture
No change to the CLI's runtime. Failure mode: a registry outage makes the check red (fail closed) but
`npm test` stays green. Unknown latest counts as drift, never as a pass.

## Cost
Zero. One extra CI job (~15 s).
