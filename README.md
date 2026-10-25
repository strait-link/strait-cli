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
```

`strait init` sets up Strait deep links in a React Native, Expo, Flutter or Android (Kotlin) app:

1. Detects the app from its files (`package.json`, `app.json`, `pubspec.yaml`, Gradle files). Nothing is run.
2. Takes your publishable key and link host as flags, or asks for them in a terminal. A secret key (`st_live_…`) is refused, because it must never ship in an app.
3. Writes the integration file, with your key, host and an `onLink` handler:

   | App | File written |
   |---|---|
   | React Native | `links.ts` (or `links.js`) |
   | Expo | `links.ts`, plus `app/+native-intent.tsx` with Expo Router |
   | Flutter | `lib/links.dart` |
   | Android | `app/src/main/java/<package>/StraitLinks.kt` |

4. Prints the remaining steps for your app: the install command, the AndroidManifest intent filters (or the `app.json` block for Expo), the iPhone Associated Domains entry, what to fill in under Dashboard → Apps & stores, and the `curl` checks for `assetlinks.json` and `apple-app-site-association`. Steps the project already has, such as the intent filters, are marked `[already done]`.

It never edits your existing files and never overwrites an earlier integration file unless you pass `--force`.

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

Runs the same checks, with the same finding ids and wording, as `doctor()` in the Strait SDKs (React Native 0.9.3, Swift 0.9.4, Android 0.8.4, Flutter 0.9.4; contract B23, the 43 shared cases in `test/doctor-vectors.json`). It fetches `https://<host>/.well-known/assetlinks.json` and `apple-app-site-association` once each and tells you whether your package, bundle ID and (with `--cert`) signing certificate are listed, with the fix for each problem:

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
