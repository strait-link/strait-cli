# Changelog

## 0.3.5 (9 Nov 2026)

- `strait app verify`: one command that says what's wrong with your setup and how to fix it. The same checks as Dashboard › Setup › Integration health (app details, each link domain's files fetched live, SDK reporting in and current, link opens, webhooks), one line each, with the fix under anything that isn't a pass. Exit 1 when a check fails or couldn't run, `--json` for AI agents and CI. Needs a secret key (`STRAIT_SECRET_KEY`, read or full access).
- `strait app`: the setup Strait has for your workspace: Android package and fingerprints, iPhone App ID, each link domain and whether its files are served, and the SDK version each platform last sent.
- `strait doctor` with a secret key also runs `strait app verify` and prints its checks under "Account" (`--host` is then optional). Checks that can't run say "Could not check" and fail the run. **Behaviour change:** a CI job that already sets `STRAIT_SECRET_KEY` now gets these account checks in `doctor` too (and exit 1 on an account failure); to keep a host-only check, run `env -u STRAIT_SECRET_KEY npx @straitlink/cli doctor --host …`.

## 0.3.4 (9 Nov 2026)

- `strait init` and `strait events add` write today's SDKs: React Native 0.11.3 (npm), Flutter 0.10.6 (pub.dev), iOS 0.11.4 (SwiftPM) and Android 0.10.4 (JitPack) (was 0.11.0, 0.10.2, 0.11.1 and 0.10.1). A new app now starts with the install campaign tags, the SDK naming itself in its reports, and iPhone install matching across IPv4 / IPv6.
- These can't fall behind again: CI checks every pin against npm, pub.dev and the SDK tags on each push, every day, and before each release, and fails when one is older than the latest (`npm run check:sdk-versions`).

## 0.3.3 (9 Nov 2026)

- `strait init` for Flutter and Android (Kotlin) adds the INTERNET permission to `AndroidManifest.xml` when it's missing. Flutter's template declares it only for debug and profile builds, so a release build couldn't reach Strait (no deferred match, no install recorded). The edit is one line after `<manifest>`, made once (a second run leaves the file alone), listed under "Edited:" and shown by `--dry-run` without writing. React Native and Expo are unchanged: their templates already have it.

## 0.3.2 (8 Nov 2026)

- `strait init` writes the SDKs that carry the `doctor()` "Apps & stores" fix: Android 0.10.1 (JitPack), iOS 0.11.1 (SwiftPM) and Flutter 0.10.2 (was 0.10.0, 0.11.0 and 0.10.1), so an app set up with `init` gets the same next step from `doctor()` as from `strait doctor`.

## 0.3.1 (7 Nov 2026)

- `strait init` writes React Native 0.11.0 (now on npm, was 0.10.2).
- `strait doctor` and `strait test`: on a link domain before Dashboard → Apps & stores is filled in (Strait answers 404 `{"error":"not configured"}`), the finding is `app.none` with "Fill in Dashboard → Apps & stores (package name and SHA-256 fingerprint / Team ID and bundle ID), wait a minute, then check again", the same step `strait init` gives, not `host.file_missing` ("use your Strait link domain as endpoint"). Same wording as `doctor()` in the SDKs (51 shared vectors, shared-spec ADR 0002 amendment).

## 0.3.0 (7 Nov 2026)

- `strait events add`: the Flutter snippet shows `eventId` (strait_sdk 0.10.0+ has it); the React Native one says `eventId` needs 0.11.0+.
- `strait init` writes setup for today's SDKs: Android 0.10.0 (JitPack), iOS 0.11.0 (SwiftPM), and Flutter 0.10.1 (was 0.8.4, 0.9.5 and 0.9.7); React Native stays 0.10.2 until 0.11.0 is on npm. `strait events add` reads the same versions and says the iOS/Android `eventId` needs them.
- `strait test`: one pass/fail list that says you're set up right: the engine answers, the secret key is valid (which workspace, test or live), and the workspace's link domain serves apple-app-site-association and assetlinks.json. Exit 1 on any failure, `--json` for CI.
- `strait events add <name>`: prints ready-to-paste event tracking code for React Native, Flutter, iOS, Android or the web (detected from the project files, or `--platform`), using each SDK's real `trackEvent` call.
- `strait events add --platform web` prints `@straitlink/web`'s new `trackEvent` instead of a hand-written `POST /v1/event` (needs the web SDK release that adds it).

## 0.2.2 (4 Nov 2026)

- `strait init` on an Expo Router project whose routes live in `src/app` writes `src/app/+native-intent.tsx` and `src/links.ts` (was `app/` at the root, which Expo Router then ignored) and points you at `src/app/_layout.tsx`.

## 0.2.1 (3 Nov 2026)

- `strait init` writes setup for today's SDKs: React Native 0.10.2, Flutter 0.9.7, iOS 0.9.5 (Android stays 0.8.4), the versions npm, pub.dev and the Swift tags have, same as the website.
- Release workflow: a tag whose version is already on npm runs the tests and skips the publish instead of failing.

## 0.1.4 (24 Oct 2026)

- Writes setup for today's SDKs: React Native 0.9.3, iOS 0.9.4, Android 0.8.3 (Flutter stays 0.9.3), the same as the website.
- Repository and issue links, and the GitHub owner in printed install lines, point at strait-link (the org since 23 Oct).

## 0.1.3 (24 Oct 2026)

- package.json `repository`, `bugs` and `homepage` point at github.com/strait-link/strait-cli (the npm page linked to a repo that does not exist). No code change.
