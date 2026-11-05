// `strait events add <name>`: ready-to-paste tracking code, each SDK's real event call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.mjs';
import { FIXTURES, sink } from './helpers.mjs';

const run = async (args, { env = {} } = {}) => {
  const stdout = sink();
  const stderr = sink();
  const code = await main(['events', ...args], { stdout, stderr, env, isTTY: false });
  return { code, out: stdout.text, err: stderr.text };
};
const dirWith = (files) => {
  const d = mkdtempSync(join(tmpdir(), 'strait-events-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(d, p, '..'), { recursive: true });
    writeFileSync(join(d, p), c);
  }
  return d;
};

test('each platform prints its SDK\'s real event call with the name', async () => {
  const want = {
    'react-native': [/import \{ links \} from '\.\/links'/, /await links\.trackEvent\('purchase'\);/, /value: 49\.99, currency: 'USD', eventId: order\.id/],
    flutter: [/import 'links\.dart';/, /await links\.trackEvent\('purchase'\);/, /value: 49\.99, currency: 'USD'/],
    ios: [/strait\.trackEvent\("purchase"\) \{ ok in/, /eventId: order\.id/, /StraitSDK 0\.10\.0\+/],
    android: [/StraitLinks\.client\.trackEvent\("purchase"\)/, /off the main thread/, /eventId = order\.id/, /strait-sdk-android 0\.9\.0\+/],
    web: [/import \{ reportWebOpen, trackEvent \} from '@straitlink\/web'/, /await reportWebOpen\(strait\);/, /await trackEvent\(strait, 'purchase'\);/, /value: 49\.99, currency: 'USD', eventId: order\.id/],
  };
  for (const [platform, patterns] of Object.entries(want)) {
    const r = await run(['add', 'purchase', '--platform', platform, FIXTURES]);
    assert.equal(r.code, 0, `${platform}: ${r.err}`);
    for (const p of patterns) assert.match(r.out, p, platform);
  }
});

test('Flutter has no eventId parameter, so its snippet never shows one', async () => {
  const r = await run(['add', 'purchase', '--platform', 'flutter', FIXTURES]);
  assert.doesNotMatch(r.out, /eventId/);
});

test('detects the platform from the project files', async () => {
  const cases = {
    'rn-bare': 'React Native',
    'expo-js': 'React Native',
    'flutter-app': 'Flutter',
    'android-kotlin': 'Android',
  };
  for (const [fixture, label] of Object.entries(cases)) {
    const r = await run(['add', 'signup', join(FIXTURES, fixture)]);
    assert.equal(r.code, 0, `${fixture}: ${r.err}`);
    assert.match(r.out, new RegExp(`signup.*${label}|${label}.*signup`), fixture);
  }
  const ios = await run(['add', 'signup', dirWith({ 'Acme.xcodeproj/project.pbxproj': '' })]);
  assert.match(ios.out, /strait\.trackEvent\("signup"\)/);
  const spm = await run(['add', 'signup', dirWith({ 'Package.swift': '// swift-tools-version:5.9' })]);
  assert.match(spm.out, /strait\.trackEvent\("signup"\)/);
  const web = await run(['add', 'signup', dirWith({ 'package.json': JSON.stringify({ dependencies: { vite: '5' } }) })]);
  assert.match(web.out, /trackEvent\(strait, 'signup'\)/);
});

test('web uses the SDK call, not a hand-written request', async () => {
  const r = await run(['add', 'purchase', '--platform', 'web']);
  assert.doesNotMatch(r.out, /fetch\(|\/v1\/event|localStorage/);
});

test('web fills in the publishable key and link host from the environment when set', async () => {
  const r = await run(['add', 'purchase', '--platform', 'web'], { env: { STRAIT_PUBLISHABLE_KEY: 'st_pub_live_0123456789abcdef', STRAIT_LINK_HOST: 'acme.strait.link' } });
  assert.match(r.out, /publishableKey: 'st_pub_live_0123456789abcdef'/);
  assert.match(r.out, /endpoint: 'https:\/\/acme\.strait\.link'/);
});

test('a project without the SDK gets a hint to run strait init first', async () => {
  const r = await run(['add', 'purchase', join(FIXTURES, 'rn-bare')]);
  assert.match(r.out, /strait init/);
});

test('nothing detected and no --platform: usage error that lists the platforms', async () => {
  const r = await run(['add', 'purchase', join(FIXTURES, 'unknown')]);
  assert.equal(r.code, 2);
  assert.match(r.err, /--platform react-native\|flutter\|ios\|android\|web/);
});

test('event names that would break the printed code are refused', async () => {
  for (const bad of ["it's", 'a"b', '${x}', 'a\\b', 'x'.repeat(65), ' ']) {
    const r = await run(['add', bad, '--platform', 'web']);
    assert.equal(r.code, 2, bad);
    assert.match(r.err, /event name/i);
  }
  const ok = await run(['add', 'Sign Up: step-2.v1', '--platform', 'web']);
  assert.equal(ok.code, 0, ok.err);
});

test('usage errors: missing name, unknown platform, unknown subcommand', async () => {
  assert.equal((await run(['add', '--platform', 'web'])).code, 2);
  const p = await run(['add', 'x', '--platform', 'unity']);
  assert.equal(p.code, 2);
  assert.match(p.err, /react-native/);
  const s = await run(['remove', 'x']);
  assert.equal(s.code, 2);
  assert.match(s.err, /strait events add <name>/);
});

test('env values that could break the quoted code stay placeholders', async () => {
  const r = await run(['add', 'purchase', '--platform', 'web'], { env: { STRAIT_PUBLISHABLE_KEY: "st_pub_live_abc'+alert(1)+'", STRAIT_LINK_HOST: "x.com'; alert(1); '" } });
  assert.equal(r.code, 0);
  assert.match(r.out, /publishableKey: 'st_pub_live_…'/);
  assert.match(r.out, /endpoint: 'https:\/\/<your-handle>\.strait\.link'/);
  assert.doesNotMatch(r.out, /alert/);
});

test('too many arguments is a usage error', async () => {
  assert.equal((await run(['add', 'purchase', '.', 'extra', '--platform', 'web'])).code, 2);
});
