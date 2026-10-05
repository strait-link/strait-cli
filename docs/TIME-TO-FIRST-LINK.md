# Time to first link

**Definition:** the time from a developer opening the docs to their app logging `Strait link: … true /product/42` after they tap a Strait link on an Android phone. It follows the 5-minute quickstart (`/docs/quick-start/`), with `strait init` doing step 5.

There are two parts: what a script can time, and what a person has to time by hand.

## 1. Scripted parts

```bash
node scripts/time-to-first-link.mjs
```

This copies each fixture app to a temp folder, runs `strait init` on it and prints how long each run took. Nothing touches the network.

```bash
STRAIT_SECRET_KEY=st_live_… STRAIT_API=strait.link node scripts/time-to-first-link.mjs --live
```

This also times the server side of the path:

1. `POST /v1/links` creates a link with the slug `ttfl-<time>`.
2. The script fetches the short link with an Android Chrome user agent, without following redirects, and reports where the server sent it (for example `302 → intent://…`).
3. It fetches `/.well-known/assetlinks.json` on the link host. A 404 here means the package name or SHA-256 fingerprints are not yet saved in Settings. That only affects verified App Links, not the custom-scheme path, so it does not count as a failure.

`--live` creates one real link in the key's workspace and never deletes anything. Run it only against a workspace you own.

### Measured (5 Oct 2026, offline part only, MacBook, Node 26)

| Run | Result |
|---|---|
| `strait init`, 5 fixture apps | Each finished in 0.4 to 1.2 ms. The non-app folder was refused with a clear message. |
| `npx` from the packed tarball, React Native fixture | 1.0 s wall clock, including npx start-up. Exit 0, `links.ts` written. |

The `--live` run has not been done yet. It needs a secret key and creates a real link, so the founder runs it.

## 2. By hand (stopwatch protocol)

Run this with a person who has not used Strait before, on a fresh React Native app (`npx @react-native-community/cli init`) and an Android phone with USB debugging on. Start the clock when they open `/docs/quick-start/`. Write down the time at each line:

| # | Step | Ends when |
|---|---|---|
| 1 | Sign up, name the workspace | Dashboard → Get started shows the link domain and publishable key |
| 2 | Settings: package name + custom scheme | "Settings saved" |
| 3 | Create the `summer` link (dashboard or curl) | The link is in the list |
| 4 | `strait init --key … --host …` | Files written, steps printed |
| 5 | Follow the printed steps: install, `import './links'`, intent filters | The files are saved |
| 6 | Rebuild (`npx react-native run-android`) | The app is running on the phone |
| 7 | Send `https://<handle>.strait.link/summer` to themselves in Messages or Gmail and tap it | Metro logs `Strait link: … true /product/42` |

Also record where they got stuck and the exact error text. Step 6 is usually the longest, and the first Android build alone can take several minutes. Report the total and the time for each step separately, so the build time does not hide the setup time.

Do not publish a time-to-first-link number on the website until at least 5 people have run this protocol (council truth rules: no unmeasured claims).
