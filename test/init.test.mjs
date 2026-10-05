import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../src/cli.mjs';
import { planInit, writeFiles } from '../src/init.mjs';
import { installSpecs } from '../src/install.mjs';
import { HOST, KEY, copyFixture, sink } from './helpers.mjs';

const run = async (args, extra = {}) => {
  const stdout = sink();
  const stderr = sink();
  const code = await main(args, { stdout, stderr, env: {}, isTTY: false, ...extra });
  return { code, out: stdout.text, err: stderr.text };
};
const listAll = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? listAll(join(d, n)).map((x) => `${n}/${x}`) : [n])).sort();

test('React Native: writes links.ts with key, host and an onLink handler, prints manifest + verification steps', async () => {
  const dir = copyFixture('rn-bare');
  const r = await run(['init', dir, '--key', KEY, '--host', `https://${HOST}/summer`]);
  assert.equal(r.code, 0, r.err);
  const links = readFileSync(join(dir, 'links.ts'), 'utf8');
  assert.match(links, new RegExp(`publishableKey: '${KEY}'`));
  assert.match(links, /endpoint: 'https:\/\/acme\.strait\.link'/);
  assert.match(links, /links\.onLink\(\(e\) =>/);
  assert.match(links, /links\.start\(\);/);
  assert.match(r.out, /npm install github:[^/]+\/strait-sdk-react-native#v0\.8\.0/);
  assert.match(r.out, /<data android:scheme="https" android:host="acme\.strait\.link" \/>/);
  assert.match(r.out, /<data android:scheme="acmeshop" \/>/);
  assert.match(r.out, /curl https:\/\/acme\.strait\.link\/\.well-known\/assetlinks\.json/);
  assert.match(r.out, /curl https:\/\/acme\.strait\.link\/\.well-known\/apple-app-site-association/);
  assert.match(r.out, /adb shell pm get-app-links com\.acme\.shop/);
  assert.match(r.out, /iPhone \(beta\)/);
});

test('Expo Router: links.ts + app/+native-intent.tsx, app.json block with intentFilters and associatedDomains', async () => {
  const dir = copyFixture('expo-router');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(dir, 'links.ts')));
  assert.match(readFileSync(join(dir, 'app/+native-intent.tsx'), 'utf8'), /redirectSystemPath/);
  assert.match(r.out, /"scheme": "acmeexpo"/);
  assert.match(r.out, /"autoVerify": true/);
  assert.match(r.out, /"applinks:acme\.strait\.link"/);
  assert.match(r.out, /router\.push/);
  assert.match(r.out, /npx expo run:android/);
  assert.doesNotMatch(r.out, /AndroidManifest\.xml/, 'Expo takes link settings in app.json');
});

test('Expo without TypeScript gets links.js', async () => {
  const dir = copyFixture('expo-js');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(dir, 'links.js')));
  assert.ok(!existsSync(join(dir, 'app/+native-intent.tsx')));
});

test('Flutter: lib/links.dart, pubspec install from the constant, manifest already done', async () => {
  const dir = copyFixture('flutter-app');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 0, r.err);
  const dart = readFileSync(join(dir, 'lib/links.dart'), 'utf8');
  assert.match(dart, new RegExp(`publishableKey: '${KEY}'`));
  assert.match(dart, /links\.onLink\.listen/);
  for (const line of installSpecs().flutterPubspec.split('\n')) assert.ok(r.out.includes(`    ${line}\n`), line);
  assert.match(r.out, /intent filters for acme\.strait\.link and acmeflutter:\/\/ are already there/);
  assert.match(r.out, /flutter_deeplinking_enabled" android:value="false"/);
  assert.doesNotMatch(r.out, /android:autoVerify/, 'filters already present are not printed again');
  assert.match(r.out, /FlutterDeepLinkingEnabled = NO/);
});

test('Flutter with filters and the meta-data already in the manifest: step marked done', async () => {
  const dir = copyFixture('flutter-app');
  const mf = join(dir, 'android/app/src/main/AndroidManifest.xml');
  writeFileSync(mf, readFileSync(mf, 'utf8').replace('<intent-filter android:autoVerify', '<meta-data android:name="flutter_deeplinking_enabled" android:value="false" />\n      <intent-filter android:autoVerify'));
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /AndroidManifest\.xml {2}\[already done\]/);
});

test('Android (Kotlin): StraitLinks.kt in the app package, Gradle lines from the constant', async () => {
  const dir = copyFixture('android-kotlin');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 0, r.err);
  const kt = readFileSync(join(dir, 'app/src/main/java/com/acme/shop/StraitLinks.kt'), 'utf8');
  assert.match(kt, /^package com\.acme\.shop$/m);
  assert.match(kt, new RegExp(`publishableKey = "${KEY}"`));
  assert.match(kt, /fun readInstallReferrer/);
  assert.ok(r.out.includes(`implementation("${installSpecs().android}")`));
  assert.match(r.out, /maven\("https:\/\/jitpack\.io"\)/);
  assert.match(r.out, /StraitLinks\.init\(this\)/);
  assert.match(r.out, /<data android:scheme="https" android:host="acme\.strait\.link" \/>/);
});

test('--dry-run writes nothing and shows the file contents', async () => {
  const dir = copyFixture('rn-bare');
  const before = listAll(dir);
  const r = await run(['init', dir, '--key', KEY, '--host', HOST, '--dry-run']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(listAll(dir), before);
  assert.match(r.out, /Dry run: nothing written/);
  assert.match(r.out, /--- links\.ts/);
});

test('an existing integration file is kept unless --force', async () => {
  const dir = copyFixture('rn-bare');
  writeFileSync(join(dir, 'links.ts'), '// mine\n');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 2);
  assert.match(r.err, /Not overwriting links\.ts/);
  assert.equal(readFileSync(join(dir, 'links.ts'), 'utf8'), '// mine\n');
  const dry = await run(['init', dir, '--key', KEY, '--host', HOST, '--dry-run']);
  assert.match(dry.out, /already exists; a real run needs --force/);
  const forced = await run(['init', dir, '--key', KEY, '--host', HOST, '--force']);
  assert.equal(forced.code, 0, forced.err);
  assert.match(readFileSync(join(dir, 'links.ts'), 'utf8'), /createStrait/);
});

test('a secret key is refused and nothing is written', async () => {
  const dir = copyFixture('rn-bare');
  const r = await run(['init', dir, '--key', 'st_live_0123456789abcdef', '--host', HOST]);
  assert.equal(r.code, 2);
  assert.match(r.err, /secret key/);
  assert.ok(!existsSync(join(dir, 'links.ts')));
});

test('without a terminal, missing flags fail with exit 2 instead of hanging', async () => {
  const dir = copyFixture('rn-bare');
  const r = await run(['init', dir]);
  assert.equal(r.code, 2);
  assert.match(r.err, /Missing --key and --host/);
});

test('flags can come from the environment', async () => {
  const dir = copyFixture('rn-bare');
  const r = await run(['init', dir], { env: { STRAIT_PUBLISHABLE_KEY: KEY, STRAIT_LINK_HOST: HOST } });
  assert.equal(r.code, 0, r.err);
});

test('in a terminal it asks, re-asks on a bad answer, and takes the suggested scheme on Enter', async () => {
  const dir = copyFixture('rn-bare');
  const answers = ['st_live_0123456789abcdef', KEY, 'acme', HOST, ''];
  const asked = [];
  const ask = { question: async (q) => { asked.push(q); return answers.shift(); }, close() {} };
  const r = await run(['init', dir], { isTTY: true, ask });
  assert.equal(r.code, 0, r.err);
  assert.equal(asked.length, 5);
  assert.match(asked[4], /\[acmeshop\]/);
  assert.match(r.err, /secret key/);
  assert.match(readFileSync(join(dir, 'links.ts'), 'utf8'), /acme\.strait\.link/);
});

test('--yes never prompts', async () => {
  const dir = copyFixture('rn-bare');
  const ask = { question: async () => { throw new Error('prompted'); } };
  const r = await run(['init', dir, '--yes'], { isTTY: true, ask });
  assert.equal(r.code, 2);
});

test('unknown folder: clear message; --framework overrides detection', async () => {
  const dir = copyFixture('unknown');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 2);
  assert.match(r.err, /No React Native, Expo, Flutter or Android app found/);
  const forced = await run(['init', dir, '--key', KEY, '--host', HOST, '--framework', 'react-native', '--scheme', 'acmeshop', '--dry-run']);
  assert.equal(forced.code, 0, forced.err);
  const bad = await run(['init', dir, '--key', KEY, '--host', HOST, '--framework', 'ionic']);
  assert.equal(bad.code, 2);
});

test('no scheme can be guessed → asks for --scheme', async () => {
  const dir = copyFixture('unknown');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST, '--framework', 'flutter']);
  assert.equal(r.code, 2);
  assert.match(r.err, /Pass --scheme/);
});

test('help and unknown commands', async () => {
  assert.equal((await run(['--help'])).code, 0);
  assert.equal((await run([])).code, 2);
  assert.match((await run(['deploy'])).err, /Unknown command/);
  assert.equal((await run(['init', '--bogus'])).code, 2);
});

test('planInit + writeFiles: plan is pure, write creates folders', () => {
  const dir = copyFixture('android-kotlin');
  const plan = planInit({ dir, key: KEY, host: HOST });
  assert.equal(plan.files.length, 1);
  assert.ok(!existsSync(plan.files[0].abs));
  writeFiles(plan);
  assert.ok(existsSync(plan.files[0].abs));
});
