# 0001: `strait test` and `strait events add`

5 Nov 2026 · item cli-test-events-add

## Problem
Launch-day developers live in the terminal. Their first support question is "am I set up right?", and
their first event is slowed by looking up each SDK's event call. Time to first event is our activation metric.

## Who it serves
A developer with a secret key and an app, in a terminal or a CI job.

## Options
- **Do nothing.** `doctor` checks the link host but not the key or the workspace; event code lives in five READMEs.
- **Extend what exists (chosen).** `strait test` = `GET /healthz` + `GET /v1/workspace` (both live today) +
  the existing `runDoctor` on the workspace's link domain. `strait events add` prints the one call each
  SDK already has (`trackEvent` in React Native, Flutter, iOS, Android; the web SDK has no event helper,
  so it prints the same `POST /v1/event` its own example uses). No engine, SDK or database change.
  *Update 5 Nov 2026:* the web SDK gained `trackEvent` (strait-sdk-web ADR 0002); the web snippet now prints it.
- **New engine endpoint for a combined check.** Rejected: everything needed is already served.
- **Write the event code into the user's files.** Rejected: we can't know where their purchase happens;
  printing is safe and reviewable.

## Security
- Secret key read from `STRAIT_SECRET_KEY` / `--secret-key` through the existing `secretKey()` and
  `apiClient()` (https only, never echoed, errors redacted). Only the key prefix the API returns is printed.
- Read-only calls; `/v1/workspace` is rate limited per workspace (30/min) on the engine.
- The event name is restricted to `A-Z a-z 0-9 space _ . : -` (1-64) so the printed code can't be broken
  or injected by quotes, `$` or backslashes; the engine's own limit is 64 characters.

## Architecture
No new coupling: same endpoints the MCP server and `links` use. Failure modes are reported as `fail`
lines, never thrown: engine down skips the key and domain checks; a bad key skips the domain check.
Exit 0 all pass, 1 any fail, 2 usage error (CI-friendly).

## Cost
None beyond three GETs per run.
