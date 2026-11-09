<h1 align="center">Strait CLI</h1>

<p align="center"><strong>Straight to the screen. On the record.</strong><br>
One command sets up Strait deep links in your app. Every link open and install is then recorded in your Strait dashboard.</p>

<p align="center">
  <a href="https://straitlink.in/docs/">Docs</a> ·
  <a href="https://straitlink.in/platform-status/">Platform status</a> ·
  <a href="#docs-and-support">Talk to the Strait team</a>
</p>

`@straitlink/cli`

```bash
npx @straitlink/cli init                                     # set up deep links in your app
npx @straitlink/cli doctor --host acme.strait.link          # check the link host lists your app
npx @straitlink/cli links create summer https://acme.com/s  # create a link (secret key in env)
npx @straitlink/cli test                                    # key, engine and link domain: pass/fail (secret key in env)
npx @straitlink/cli app verify                              # your whole setup, each problem with its fix (secret key in env)
npx @straitlink/cli events add purchase                     # print the code that tracks an event
```

`strait init` sets up Strait deep links in a React Native, Expo, Flutter or Android (Kotlin) app:

1. Detects the app from its files (`package.json`, `app.json`, `pubspec.yaml`, Gradle files). Nothing is run.
2. Takes your publishable key and link host as flags, or asks for them in a terminal. A secret key (`st_live_…`) is refused, because it must never ship in an app.
3. Writes the integration file, with your key, host and an `onLink` handler:

   | App | File written |
   |---|---|
   | React Native | `links.ts` (or `links.js`) |
   | Expo | `links.ts`, plus `app/+native-intent.tsx` with Expo Router (`src/links.ts` and `src/app/+native-intent.tsx` when your routes live in `src/app`) |
   | Flutter | `lib/links.dart` |
   | Android | `app/src/main/java/<package>/StraitLinks.kt` |

4. Prints the remaining steps for your app: the install command, the AndroidManifest intent filters (or the `app.json` block for Expo), the iPhone Associated Domains entry, what to fill in under Dashboard → Apps & stores, and the `curl` checks for `assetlinks.json` and `apple-app-site-association`. Steps the project already has, such as the intent filters, are marked `[already done]`.

It edits one existing file, and only when needed: in a Flutter or Android (Kotlin) app it adds `<uses-permission android:name="android.permission.INTERNET" />` to `AndroidManifest.xml` if it isn't there. Flutter's own template only has it in debug builds, so without it a release build can't reach Strait and no link or install is matched. Everything else it prints for you to add. It never overwrites an earlier integration file unless you pass `--force`, and `--dry-run` shows the manifest line without writing it.

## Use

Run it in your app's folder. Node 18.17 or newer; nothing to install first.

```bash
npx @straitlink/cli init                                         # asks for the key and host
npx @straitlink/cli init --key st_pub_live_… --host acme.strait.link
npx @straitlink/cli init ../my-app --dry-run                     # show the files and steps, write nothing
```

From a checkout of this repo: `node bin/strait.mjs init ../my-app`, or `npm link && strait init`.

| Option | |
|---|---|
| `--key` | Publishable key (Dashboard → Get started). Env: `STRAIT_PUBLISHABLE_KEY` |
| `--host` | Link domain, e.g. `acme.strait.link`. A pasted link works too. Env: `STRAIT_LINK_HOST` |
| `--scheme` | Custom scheme: the one you typed in Dashboard → Apps & stores. Taken from `app.json`, or guessed from the package name (`com.acme.shop` → `acmeshop`); a guess is marked "(guessed from …)" in the output |
| `--framework` | `react-native`, `expo`, `flutter` or `android`, to skip detection |
| `--dry-run` | Print the files and steps; write nothing |
| `--force` | Replace an existing integration file |
| `--yes`, `-y` | Never prompt. Exits 2 if something is missing (for CI and agents) |

Exit codes: `0` done, `2` usage problem (message on stderr), `1` unexpected error.

## Check your setup: `strait doctor`

```bash
npx @straitlink/cli doctor --host acme.strait.link --android com.acme.shop --ios com.acme.shop
```

Runs the same checks, with the same finding ids and wording, as `doctor()` in the Strait SDKs (React Native, Flutter, iOS, Android and Unity; contract B23, the shared cases in `test/doctor-vectors.json`). It fetches `https://<host>/.well-known/assetlinks.json` and `apple-app-site-association` once each and tells you whether your package, bundle ID and (with `--cert`) signing certificate are listed, with the fix for each problem:

```
Android (assetlinks.json)
  error  app.missing       acme.strait.link doesn't list com.acme.shop
                           Fix: Add com.acme.shop in Dashboard → Apps & stores (listed now: com.acme.app).
```

| Option | |
|---|---|
| `--host` | Your link domain. Env: `STRAIT_LINK_HOST` |
| `--android <package>` / `--ios <bundleId>` | The app to look for. With neither, both files are checked and the apps they list are shown |
| `--cert <sha256>` | Android signing certificate fingerprint, any format; repeat for debug, release and Play App Signing |
| `--key` | Also check the publishable key. Env: `STRAIT_PUBLISHABLE_KEY`. Left out, the key check is skipped |
| `--json` | The reports as JSON, for CI and agents |

With a secret key (`STRAIT_SECRET_KEY` or `--secret-key`), `doctor` also runs [`strait app verify`](#whats-wrong-with-my-setup-strait-app-verify) and prints its checks under "Account"; `--host` is then optional. If those checks can't run (a refused or malformed key, no connection, the 6-a-minute limit) it says "Could not check" and exits `1`, never a silent pass. `--json` adds them as `verify`. If your CI sets `STRAIT_SECRET_KEY` and should check only the host, unset it for the doctor step (`env -u STRAIT_SECRET_KEY npx @straitlink/cli doctor --host …`).

Exit codes: `0` no errors (warnings allowed), `1` a check failed, `2` usage problem. What a terminal can't see (intent filters, the Associated Domains entitlement) is checked by `doctor()` inside a debug build and by the [free tools](https://straitlink.in/tools/).

## Manage links: `strait links`

```bash
export STRAIT_SECRET_KEY=st_live_…        # Dashboard → Settings → Secret keys
npx @straitlink/cli links create summer https://acme.com/summer --campaign sale --tag email
npx @straitlink/cli links list --status active --limit 20
npx @straitlink/cli links qr summer --size 512          # writes summer.png
npx @straitlink/cli links qr summer --format svg --out summer.svg
```

These call the [public API](https://straitlink.in/docs/api/) (`POST /v1/links`, `GET /v1/links`, `GET /v1/links/{slug}/qr`) with a secret key from `STRAIT_SECRET_KEY` or `--secret-key` (the environment is better: flags stay in your shell history). The key is never printed, not even inside an API error. A publishable key is refused here. `--api-url` (env `STRAIT_API_URL`) points at another engine and must be https. `--json` prints the API answer as is. A QR file is never overwritten without `--force`.

Exit codes: `0` done, `1` the API said no or can't be reached (its message on stderr), `2` usage problem.

## Am I set up right? `strait test`

```bash
export STRAIT_SECRET_KEY=st_live_…        # Dashboard → Settings → Secret keys
npx @straitlink/cli test
```

```
Strait test

  pass  Engine       https://strait.link answers (version ddca50a)
  pass  Key          valid live key st_live_3f9a… for workspace "Acme"
  pass  Link domain  acme.strait.link (plan starter)
  pass  iPhone       acme.strait.link lists TEAM123.com.acme.shop
  pass  Android      acme.strait.link lists com.acme.shop

All checks passed.
Your app's own setup (intent filters, Associated Domains): strait doctor --android <package> --ios <bundleId>.
```

One read-only pass: the engine answers (`GET /healthz`), the secret key is valid and which workspace it belongs to, test or live (`GET /v1/workspace`), and the workspace's link domain serves `apple-app-site-association` and `assetlinks.json` listing your apps (the same checks as `strait doctor`). A failed check prints its fix; checks that need it are skipped. Exit `1` when any check fails, `2` for a missing or wrong kind of key, so it can gate a CI job. `--json` prints `{ ok, workspace, checks }`. Same key rules as `strait links`: never printed, publishable keys refused.

## What's wrong with my setup? `strait app verify`

```bash
export STRAIT_SECRET_KEY=st_live_…        # Dashboard → Settings → Secret keys (read or full access)
npx @straitlink/cli app            # the setup Strait has: apps, link domains and their files, SDKs seen
npx @straitlink/cli app verify     # every check, with the fix for each problem
```

```
Strait app verify (checked 2026-11-09 17:44 UTC)

  pass     Android app details are complete
  pass     Android file served correctly on acme.strait.link
  warn     Your iPhone build runs a Strait SDK from before 5 Nov 2026
           Its app opens don't say which SDK version sent them, so Strait can't tell what it misses.
           Fix: Update the Strait SDK to its current version (Dashboard › Setup shows it) and ship a new build.
  skip     No webhooks set up

2 pass, 1 warn, 0 fail, 0 unknown, 1 skip.
No failures. Check the warnings above.
```

The same checks as Dashboard › Setup › Integration health, from the API (`GET /v1/app`, `GET /v1/app/verify`): your Android and iPhone app details, each link domain's `assetlinks.json` and `apple-app-site-association` (fetched live), whether your app has reported in the last 24 hours, whether its SDK is current, whether app opens from a link show their screen, and webhooks. Exit `0` when nothing failed, `1` when a check failed or could not run, or the API refused the key (so an AI agent or CI job can loop until it passes), `2` for a missing or non-secret key. `--json` prints the API answer as is (`{ ok, checkedAt, summary, checks: [{ id, status, title, detail, fix, host?, platform? }] }`). Nothing secret is printed: no keys, emails or webhook URLs.

## Track an event: `strait events add`

```bash
npx @straitlink/cli events add purchase                 # platform detected from the project files
npx @straitlink/cli events add sign_up --platform ios   # react-native | flutter | ios | android | web
npx @straitlink/cli events add purchase ./mobile         # [dir]: the app folder, default the current one
```

Prints ready-to-paste code with each SDK's own call: `trackEvent` in React Native (and Expo), Flutter, iOS and Android, using the client `strait init` wrote; on the web, `reportWebOpen` on page load plus `trackEvent` from `@straitlink/web`. The platform is detected from `package.json`, `pubspec.yaml`, Gradle files, an `.xcodeproj` or `Package.swift`. Nothing is written. Event names are 1-64 letters, numbers, spaces and `_ . : -`.

## Install lines: one constant

Every install line the CLI prints comes from `INSTALL` in `src/install.mjs` (`source` + `githubOwner`). It mirrors `install` in `site/site.config.json` and `INSTALL` in `dashboard/src/lib/install.ts`, and `test/install.test.mjs` fails if they drift while the repos sit side by side. Moving the SDK repos to an organisation means changing `githubOwner`. Publishing to npm, pub.dev and Maven Central means changing `source` to `"registry"`.

## Test

```bash
npm test                                  # node:test, no dependencies
node scripts/time-to-first-link.mjs       # see docs/TIME-TO-FIRST-LINK.md
```

Fixture apps live in `test/fixtures/` (bare React Native, Expo with and without Expo Router, Flutter, Kotlin, and a folder with no app).

## Docs and support

- **Docs:** [straitlink.in/docs/](https://straitlink.in/docs/) · [platform status](https://straitlink.in/platform-status/) · [troubleshooting](https://straitlink.in/docs/troubleshooting/)
- **Talk to the Strait team:** [support@straitlink.in](mailto:support@straitlink.in) (replies within 1 working day, IST) or call +91 81218 61890.
- **Bugs and feature requests:** [open an issue](https://github.com/strait-link/strait-cli/issues) on this repo.
- **Security:** never in a public issue. Write to security@straitlink.in.

## Licence

MIT. See [LICENSE](LICENSE).
