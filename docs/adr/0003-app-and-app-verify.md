# 0003: `strait app`, `strait app verify`, and `strait doctor` with a secret key

9 Nov 2026 · item cli-app-verify (engine ADR 0108: GET /v1/app, GET /v1/app/verify)

## Problem
`strait doctor` checks one link host's well-known files from the outside. It can't see what the workspace has
saved (package, fingerprints, Team ID), whether the app's SDK has reported in, whether that SDK is current, whether
app opens from a link land on their screen, or whether webhooks deliver. Those answers live in Setup › Integration
health, so a developer (or their AI agent) leaves the terminal to find out what's wrong.

## Who it serves
A developer finishing an integration, or the AI coding agent working in their repo: one command that lists
every problem with its plain-words fix, and an exit code a script or CI job can act on.

## Options
- **Do nothing.** The engine endpoints exist; `curl` works. Rejected: no fix text on screen without reading JSON,
  and `strait doctor` (the command people already run) stays blind to the account side.
- **Extend what exists (chosen).** Two thin read commands over the engine's own answers, through the existing
  `secretKey()` / `apiClient()` (https only, key never echoed, errors redacted):
  - `strait app`: GET /v1/app, printed as the setup the engine sees (apps, hosts and their file verdicts, SDK seen).
  - `strait app verify`: GET /v1/app/verify, one line per check with its fix; exit 1 unless `ok` (no fail and no
    unknown, the engine's rule, not re-derived here).
  - `strait doctor`: when a secret key is set (`STRAIT_SECRET_KEY` or `--secret-key`) it also runs verify and prints
    an "Account" block; `--host` becomes optional then (verify already re-fetches every host's files live).
  - `--json` prints the engine's answer as is (doctor: `{ ok, host?, android?, ios?, verify }`).
- **Re-implement the checks in the CLI.** Rejected: the engine owns the rules (same as the dashboard); a copy drifts.

## Security
- Same key handling as `links` / `test`: read or full secret key only (engine 403s a links-only key, 401s a
  publishable key); the key is never printed. The engine returns no keys, emails, webhook URLs or fetched-file text.
- Engine text is printed with terminal control characters removed (a workspace name or host is user-controlled).
- Read-only. The engine rate-limits verify to 6 a minute per workspace; a 429 is shown as an error, not retried.
- `doctor` never fails silently: a key the engine refuses (or an engine that can't be reached) is printed as
  "could not check" with the reason and makes the run exit 1, so a CI job can't pass on a check that never ran.

## Architecture
New `src/app.mjs` (fetch + format), wired in `src/cli.mjs`. No dependency, no engine change. Exit codes as
elsewhere: 0 ok, 1 a check failed / couldn't run / API said no, 2 usage problem.

## Cost
One or two GETs per run.
