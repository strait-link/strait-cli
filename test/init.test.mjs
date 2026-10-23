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
  assert.match(r.out, /npm install @straitlink\/react-native@0\.9\.2 /);
  assert.match(r.out, /<data android:scheme="https" android:host="acme\.strait\.link" \/>/);
  assert.match(r.out, /<data android:scheme="acmeshop" \/>/);
  assert.match(r.out, /curl https:\/\/acme\.strait\.link\/\.well-known\/assetlinks\.json/);
  assert.match(r.out, /curl https:\/\/acme\.strait\.link\/\.well-known\/apple-app-site-association/);
  assert.match(r.out, /adb shell pm get-app-links com\.acme\.shop/);
  // iPhone left beta 22 Oct 2026 (ops/IOS-STATUS-1022.md): no beta label; install matching is opt-in.
  assert.doesNotMatch(r.out, /beta/i);
  assert.match(r.out, /\n\d\. iPhone\n/);
  assert.match(r.out, /iPhone install matching is opt-in: choose a method in Dashboard → Settings → iPhone installs/);
  // App ids and fingerprints live in Apps & stores now, not Settings.
  assert.match(r.out, /Fill in Dashboard → Apps & stores/);
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
  assert.match(r.out, /iPhone install matching is opt-in/, 'Expo hears it too');
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
  assert.match(dart, /didChangeAppLifecycleState\(AppLifecycleState state\) => _ctl\.add\(switch \(state\)/, 'flutter analyze: avoid_renaming_method_parameters');
  assert.match(dart, /\(strait_sdk 0\.9\.3\)/, 'header names the Flutter SDK version');
  assert.match(r.out, /strait_sdk: \^0\.9\.3\n/);
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
  assert.doesNotMatch(r.out, /Xcode/, 'a Kotlin Android app has no iPhone project');
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
  // Say up front that the real run would stop, not "these files would be created" (review 23 Oct).
  assert.match(dry.out, /Dry run: nothing written\. A real run would stop: links\.ts already exists \(add --force to replace it\)\./);
  assert.doesNotMatch(dry.out, /These files would be created/);
  // The file line must not promise what the real run refuses (Q32, 23 Oct 2026).
  assert.doesNotMatch(dry.out, /links\.ts \(replaced\)/);
  assert.match(dry.out, /links\.ts \(already exists: kept unless --force\)/);
  const dryForced = await run(['init', dir, '--key', KEY, '--host', HOST, '--dry-run', '--force']);
  assert.match(dryForced.out, /links\.ts \(replaced\)/);
  assert.equal(readFileSync(join(dir, 'links.ts'), 'utf8'), '// mine\n');
  const forced = await run(['init', dir, '--key', KEY, '--host', HOST, '--force']);
  assert.equal(forced.code, 0, forced.err);
  assert.match(readFileSync(join(dir, 'links.ts'), 'utf8'), /createStrait/);
});

test('a guessed scheme is said out loud, and --scheme puts your own scheme everywhere (quick-start fix 1, 23 Oct 2026)', async () => {
  const dir = copyFixture('rn-bare');
  for (const extra of [[], ['--dry-run']]) {
    const guessed = await run(['init', dir, '--key', KEY, '--host', HOST, '--force', ...extra]);
    assert.equal(guessed.code, 0, guessed.err);
    assert.match(guessed.out, /scheme: acmeshop:\/\/ \(guessed from the package name com\.acme\.shop\)/);
    assert.match(guessed.out, /If you made up your own scheme \(Custom scheme in Dashboard → Apps & stores\)/);
    assert.match(guessed.out, /run this again with --scheme yourscheme/);
  }
  const real = await run(['init', copyFixture('rn-bare'), '--key', KEY, '--host', HOST]);
  assert.match(real.out, /the files written don't contain the scheme, so you don't need --force/);
  const own = await run(['init', dir, '--key', KEY, '--host', HOST, '--force', '--scheme', 'yourapp']);
  assert.equal(own.code, 0, own.err);
  assert.doesNotMatch(own.out, /guessed/);
  assert.doesNotMatch(own.out, /acmeshop/);
  assert.match(own.out, /scheme: yourapp:\/\//);
  assert.match(own.out, /<data android:scheme="yourapp" \/>/);
  assert.match(own.out, /-d "yourapp:\/\/shop\.example\.com\/product\/42"/);
  // A scheme already in app.json is the developer's own, not a guess.
  const expo = await run(['init', copyFixture('expo-router'), '--key', KEY, '--host', HOST, '--dry-run']);
  assert.doesNotMatch(expo.out, /guessed/);
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
  assert.match(asked[4], /Custom scheme \(the one in Dashboard → Apps & stores\) \[acmeshop, guessed from the package name\]/);
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
