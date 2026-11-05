# Changelog

## Unreleased

- `strait init` writes setup for today's SDKs: Android 0.9.0 (JitPack) and iOS 0.10.0 (SwiftPM), was 0.8.4 and 0.9.5; React Native 0.10.2 and Flutter 0.9.7 unchanged. `strait events add` reads the same versions and says the iOS/Android `eventId` needs them.
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
