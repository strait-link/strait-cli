// Install lines come from ONE constant (src/install.mjs), shared with the site and dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTALL, VERSIONS, installSpecs } from '../src/install.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((n) => (n === 'node_modules' || n === '.git' ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

test('github and registry sources', () => {
  // Install-line formats; the numbers come from VERSIONS (kept at the registry's latest by scripts/check-sdk-versions.mjs).
  const { rnVersion: rn, flutterVersion: fl, androidVersion: an } = VERSIONS;
  const gh = installSpecs({ source: 'github', githubOwner: 'strait-sdks' });
  assert.equal(gh.reactNative, `github:strait-sdks/strait-sdk-react-native#v${rn}`);
  assert.equal(gh.android, `com.github.strait-sdks:strait-sdk-android:v${an}`);
  assert.equal(gh.androidRepository, 'https://jitpack.io');
  assert.ok(gh.flutterPubspec.includes(`url: https://github.com/strait-sdks/strait-sdk-flutter\n      ref: v${fl}`));
  const today = installSpecs();
  assert.equal(today.reactNative, `@straitlink/react-native@${rn}`, 'npm in registry mode (16 Oct)');
  assert.equal(today.flutterPubspec, `  strait_sdk: ^${fl}`, 'pub.dev in registry mode (16 Oct)');
  assert.equal(today.android, `com.github.${INSTALL.githubOwner}:strait-sdk-android:v${an}`, 'Android stays on JitPack');
  const reg = installSpecs({ ...INSTALL, source: 'registry' });
  assert.equal(reg.reactNative, `@straitlink/react-native@${rn}`);
  assert.equal(reg.android, `in.straitlink:strait-sdk-android:${an}`);
  assert.equal(reg.flutterPubspec, `  strait_sdk: ^${fl}`);
  assert.equal(reg.androidRepository, null);
  for (const v of Object.values(VERSIONS)) assert.match(v, /^\d+\.\d+\.\d+$/);
});

test('the owner is spelled out only in src/install.mjs', () => {
  // package.json's repository/bugs name this CLI's own repo (npm provenance checks them), not the SDK repos.
  const text = (f) => {
    if (!f.endsWith(join(root, 'package.json'))) return readFileSync(f, 'utf8');
    const { repository, bugs, ...rest } = JSON.parse(readFileSync(f, 'utf8'));
    return JSON.stringify(rest);
  };
  const hits = walk(root).filter((f) => !f.endsWith(join('src', 'install.mjs')) && !f.endsWith('.md') && text(f).includes(INSTALL.githubOwner));
  assert.deepEqual(hits.map((f) => f.slice(root.length)), []);
});

// site.config.json `packages` is the one source of truth for SDK versions; VERSIONS must equal it.
// STRAIT_REPOS_DIR = a folder holding site/ and dashboard/ (default: next to this repo).
test('matches the site and dashboard constants when they sit next to this repo', (t) => {
  const repos = process.env.STRAIT_REPOS_DIR ?? join(root, '..');
  const site = join(repos, 'site', 'site.config.json');
  const dash = join(repos, 'dashboard', 'src', 'lib', 'install.ts');
  if (!existsSync(site) && !existsSync(dash)) return t.skip('no site/dashboard checkout next to strait-cli');
  if (existsSync(site)) {
    const cfg = JSON.parse(readFileSync(site, 'utf8'));
    if (cfg.install) assert.deepEqual({ source: cfg.install.source, githubOwner: cfg.install.githubOwner }, INSTALL);
    const { version, rnVersion, flutterVersion, androidVersion } = cfg.packages;
    assert.deepEqual(VERSIONS, { version, rnVersion, flutterVersion, androidVersion }, 'src/install.mjs VERSIONS = site.config.json packages');
  }
  if (existsSync(dash)) {
    const ts = readFileSync(dash, 'utf8');
    const per = typeof INSTALL.source === 'string' ? `source: '${INSTALL.source}'` : `source: { npm: '${INSTALL.source.npm}', pub: '${INSTALL.source.pub}', maven: '${INSTALL.source.maven}' }`;
    assert.ok(ts.includes(per), `dashboard install.ts has ${per}`);
    assert.match(ts, new RegExp(`githubOwner: '${INSTALL.githubOwner}'`));
  }
});
