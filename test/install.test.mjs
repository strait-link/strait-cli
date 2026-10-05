// Install lines come from ONE constant (src/install.mjs), shared with the site and dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTALL, installSpecs } from '../src/install.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((n) => (n === 'node_modules' || n === '.git' ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

test('github and registry sources', () => {
  const gh = installSpecs({ source: 'github', githubOwner: 'strait-sdks' });
  assert.equal(gh.reactNative, 'github:strait-sdks/strait-sdk-react-native#v0.8.0');
  assert.equal(gh.android, 'com.github.strait-sdks:strait-sdk-android:v0.7.2');
  assert.equal(gh.androidRepository, 'https://jitpack.io');
  assert.match(gh.flutterPubspec, /url: https:\/\/github\.com\/strait-sdks\/strait-sdk-flutter\n {6}ref: v0\.8\.0/);
  const reg = installSpecs({ ...INSTALL, source: 'registry' });
  assert.equal(reg.reactNative, '@strait/sdk-react-native@0.8.0');
  assert.equal(reg.flutterPubspec, '  strait_sdk: ^0.8.0');
  assert.equal(reg.androidRepository, null);
});

test('the owner is spelled out only in src/install.mjs', () => {
  const hits = walk(root).filter((f) => !f.endsWith(join('src', 'install.mjs')) && !f.endsWith('.md') && readFileSync(f, 'utf8').includes(INSTALL.githubOwner));
  assert.deepEqual(hits.map((f) => f.slice(root.length)), []);
});

test('matches the site and dashboard constants when they sit next to this repo', (t) => {
  const site = join(root, '..', 'site', 'site.config.json');
  const dash = join(root, '..', 'dashboard', 'src', 'lib', 'install.ts');
  if (!existsSync(site) && !existsSync(dash)) return t.skip('no site/dashboard checkout next to strait-cli');
  if (existsSync(site)) {
    const cfg = JSON.parse(readFileSync(site, 'utf8'));
    if (cfg.install) assert.deepEqual({ source: cfg.install.source, githubOwner: cfg.install.githubOwner }, INSTALL);
    assert.equal(cfg.packages.rnVersion, '0.8.0');
    assert.equal(cfg.packages.androidVersion, '0.7.2');
  }
  if (existsSync(dash)) {
    const ts = readFileSync(dash, 'utf8');
    assert.match(ts, new RegExp(`source: '${INSTALL.source}'`));
    assert.match(ts, new RegExp(`githubOwner: '${INSTALL.githubOwner}'`));
  }
});
