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
npx @straitlink/cli init
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
