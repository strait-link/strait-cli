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
  assert.equal(gh.reactNative, 'github:strait-sdks/strait-sdk-react-native#v0.9.1');
  assert.equal(gh.android, 'com.github.strait-sdks:strait-sdk-android:v0.8.0');
  assert.equal(gh.androidRepository, 'https://jitpack.io');
  assert.match(gh.flutterPubspec, /url: https:\/\/github\.com\/strait-sdks\/strait-sdk-flutter\n {6}ref: v0\.9\.2/);
  const today = installSpecs();
  assert.equal(today.reactNative, '@straitlink/react-native@0.9.1', 'npm in registry mode (16 Oct)');
  assert.equal(today.flutterPubspec, '  strait_sdk: ^0.9.2', 'pub.dev in registry mode (16 Oct)');
  assert.equal(today.android, `com.github.${INSTALL.githubOwner}:strait-sdk-android:v0.8.0`, 'Android stays on JitPack');
  const reg = installSpecs({ ...INSTALL, source: 'registry' });
  assert.equal(reg.reactNative, '@straitlink/react-native@0.9.1');
  assert.equal(reg.android, 'in.straitlink:strait-sdk-android:0.8.0');
  assert.equal(reg.flutterPubspec, '  strait_sdk: ^0.9.2');
  assert.equal(reg.androidRepository, null);
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

test('matches the site and dashboard constants when they sit next to this repo', (t) => {
  const site = join(root, '..', 'site', 'site.config.json');
  const dash = join(root, '..', 'dashboard', 'src', 'lib', 'install.ts');
  if (!existsSync(site) && !existsSync(dash)) return t.skip('no site/dashboard checkout next to strait-cli');
  if (existsSync(site)) {
    const cfg = JSON.parse(readFileSync(site, 'utf8'));
    if (cfg.install) assert.deepEqual({ source: cfg.install.source, githubOwner: cfg.install.githubOwner }, INSTALL);
    assert.equal(cfg.packages.rnVersion, '0.9.1');
    if (cfg.packages.flutterVersion) assert.equal(cfg.packages.flutterVersion, '0.9.2');
    assert.equal(cfg.packages.androidVersion, '0.8.0');
  }
  if (existsSync(dash)) {
    const ts = readFileSync(dash, 'utf8');
    const per = typeof INSTALL.source === 'string' ? `source: '${INSTALL.source}'` : `source: { npm: '${INSTALL.source.npm}', pub: '${INSTALL.source.pub}', maven: '${INSTALL.source.maven}' }`;
    assert.ok(ts.includes(per), `dashboard install.ts has ${per}`);
    assert.match(ts, new RegExp(`githubOwner: '${INSTALL.githubOwner}'`));
  }
});
