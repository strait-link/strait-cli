# @straitlink/cli

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

4. Prints the remaining steps for your app: the install command, the AndroidManifest intent filters (or the `app.json` block for Expo), the iPhone (beta) Associated Domains entry, what to fill in under Dashboard → Settings, and the `curl` checks for `assetlinks.json` and `apple-app-site-association`. Steps the project already has, such as the intent filters, are marked `[already done]`.

It never edits your existing files and never overwrites an earlier integration file unless you pass `--force`.

## Use

Not on npm yet. From this folder:

```bash
node bin/strait.mjs init ../my-app --dry-run          # asks for the key and host
node bin/strait.mjs init ../my-app --key st_pub_live_… --host acme.strait.link
npm link && strait init                               # or install the command globally
```

Once it is published: `npx @straitlink/cli init`.

| Option | |
|---|---|
| `--key` | Publishable key (Dashboard → Get started). Env: `STRAIT_PUBLISHABLE_KEY` |
| `--host` | Link domain, e.g. `acme.strait.link`. A pasted link works too. Env: `STRAIT_LINK_HOST` |
| `--scheme` | Custom scheme. Taken from `app.json`, or guessed from the package name (`com.acme.shop` → `acmeshop`) |
| `--framework` | `react-native`, `expo`, `flutter` or `android`, to skip detection |
| `--dry-run` | Print the files and steps; write nothing |
| `--force` | Replace an existing integration file |
| `--yes`, `-y` | Never prompt. Exits 2 if something is missing (for CI and agents) |

Exit codes: `0` done, `2` usage problem (message on stderr), `1` unexpected error.

## Install lines: one constant

Every install line the CLI prints comes from `INSTALL` in `src/install.mjs` (`source` + `githubOwner`). It mirrors `install` in `site/site.config.json` and `INSTALL` in `dashboard/src/lib/install.ts`, and `test/install.test.mjs` fails if they drift while the repos sit side by side. Moving the SDK repos to an organisation means changing `githubOwner`. Publishing to npm, pub.dev and Maven Central means changing `source` to `"registry"`.

## Test

```bash
npm test                                  # node:test, no dependencies
node scripts/time-to-first-link.mjs       # see docs/TIME-TO-FIRST-LINK.md
```

Fixture apps live in `test/fixtures/` (bare React Native, Expo with and without Expo Router, Flutter, Kotlin, and a folder with no app).
