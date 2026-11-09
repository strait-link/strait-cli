#!/usr/bin/env node
// Drift guard (docs/adr/0002-sdk-version-drift-guard.md): exits 1 when a pin in src/install.mjs VERSIONS
// is not the latest version its registry serves today, so `strait init` never installs an old SDK.
// Runs in CI on every push/PR, daily on a schedule, and in release.yml before `npm publish`.
// Fix a failure by bumping VERSIONS (and the CHANGELOG), never by skipping the check.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { INSTALL, PACKAGES, VERSIONS } from '../src/install.mjs';

const SEMVER = /^\d+\.\d+\.\d+$/;
const cmp = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

/** The highest stable x.y.z in a list (prereleases ignored), or null. */
export const highest = (versions) => versions.filter((v) => SEMVER.test(v)).sort(cmp).at(-1) ?? null;

/** `git ls-remote --tags` output → the x.y.z of every vX.Y.Z tag. */
export const tagsFromLsRemote = (text) => [...text.matchAll(/refs\/tags\/v(\d+\.\d+\.\d+)$/gm)].map((m) => m[1]);

/** Every pin that is not exactly the latest (older, not published yet, or latest unknown). */
export const drift = (pinned, latest) =>
  Object.keys(latest).filter((k) => pinned[k] !== latest[k]).map((key) => ({ key, pinned: pinned[key], latest: latest[key] }));

async function json(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= 2) throw err;
    }
  }
}

const gitLatest = (repo) =>
  highest(tagsFromLsRemote(execFileSync('git', ['ls-remote', '--tags', `https://github.com/${INSTALL.githubOwner}/${repo}.git`], { encoding: 'utf8', timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })));

// Where `strait init` installs each SDK from (src/install.mjs installSpecs). SwiftPM and JitPack resolve git tags.
const SOURCES = {
  rnVersion: ['React Native (npm)', async () => (await json(`https://registry.npmjs.org/${PACKAGES.reactNative.replace('/', '%2f')}/latest`)).version],
  flutterVersion: ['Flutter (pub.dev)', async () => (await json(`https://pub.dev/api/packages/${PACKAGES.flutter}`)).latest.version],
  version: ['iOS (SwiftPM tags)', async () => gitLatest('strait-sdk-swift')],
  androidVersion: ['Android (JitPack tags)', async () => {
    const v = gitLatest(PACKAGES.android);
    // A tag JitPack can't build is not installable: say so instead of asking for a pin nobody can use.
    const pom = `https://jitpack.io/com/github/${INSTALL.githubOwner}/${PACKAGES.android}/v${v}/${PACKAGES.android}-v${v}.pom`;
    const res = await fetch(pom, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`JitPack has no build of v${v} yet (${res.status} ${pom})`);
    return v;
  }],
};

async function main() {
  const latest = {};
  for (const [key, [, get]] of Object.entries(SOURCES)) latest[key] = await get().catch((err) => (console.error(`  ${key}: ${err.message}`), null));
  for (const [key, [name]] of Object.entries(SOURCES)) console.log(`${VERSIONS[key] === latest[key] ? 'ok  ' : 'DRIFT'} ${name}: pinned ${VERSIONS[key]}, latest ${latest[key] ?? 'unknown'}`);
  const rows = drift(VERSIONS, latest);
  if (rows.length) {
    console.error(`\n${rows.length} SDK pin(s) in src/install.mjs are not the registry's latest. Bump VERSIONS to the latest, add a CHANGELOG line, release.`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
