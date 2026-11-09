import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../src/cli.mjs';
import { addInternetPermission, planInit, writeFiles } from '../src/init.mjs';
import { VERSIONS, installSpecs } from '../src/install.mjs';
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
  assert.ok(r.out.includes(`npm install @straitlink/react-native@${VERSIONS.rnVersion} `));
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

test('Expo Router in src/app: writes src/links.ts + src/app/+native-intent.tsx and says src/app/_layout.tsx', async () => {
  const dir = copyFixture('expo-router');
  mkdirSync(join(dir, 'src'));
  renameSync(join(dir, 'app'), join(dir, 'src/app')); // Expo Router uses src/app when it exists
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 0, r.err);
  assert.ok(existsSync(join(dir, 'src/links.ts')), 'next to src/app, so the layout imports ../links');
  assert.ok(!existsSync(join(dir, 'links.ts')));
  assert.match(readFileSync(join(dir, 'src/app/+native-intent.tsx'), 'utf8'), /src\/app\/_layout\.tsx/);
  assert.ok(!existsSync(join(dir, 'app')), 'no stray app/ folder');
  assert.match(r.out, /Route links in src\/app\/_layout\.tsx/);
  assert.match(r.out, /import \{ links \} from '\.\.\/links';/);
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
  assert.ok(dart.includes(`(strait_sdk ${VERSIONS.flutterVersion})`), 'header names the Flutter SDK version');
  assert.ok(r.out.includes(`strait_sdk: ^${VERSIONS.flutterVersion}\n`));
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

// Flutter's template only puts INTERNET in the debug/profile manifests, so a release build
// can't reach Strait (QA 9 Nov 2026: reason=network, 0 rows). Kotlin templates have none at all.
const INTERNET = '<uses-permission android:name="android.permission.INTERNET" />';
const count = (s, sub) => s.split(sub).length - 1;

test('Flutter: init adds the INTERNET permission to the main manifest, once, and says so', async () => {
  const dir = copyFixture('flutter-app');
  const mf = join(dir, 'android/app/src/main/AndroidManifest.xml');
  const before = readFileSync(mf, 'utf8');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 0, r.err);
  const after = readFileSync(mf, 'utf8');
  assert.equal(count(after, INTERNET), 1);
  assert.match(after, /<manifest xmlns:android="http:\/\/schemas\.android\.com\/apk\/res\/android">\n {2}<uses-permission android:name="android\.permission\.INTERNET" \/>\n {2}<application>/);
  assert.equal(after.replace(`  ${INTERNET}\n`, ''), before, 'nothing else in the manifest changes');
  assert.match(r.out, /Edited:\n {2}android\/app\/src\/main\/AndroidManifest\.xml {2}adds the INTERNET permission release builds need/);
  // Second run (--force for links.dart): the manifest is left alone.
  const again = await run(['init', dir, '--key', KEY, '--host', HOST, '--force']);
  assert.equal(again.code, 0, again.err);
  assert.equal(readFileSync(mf, 'utf8'), after);
  assert.doesNotMatch(again.out, /Edited:/);
});

test('Android (Kotlin): init adds the INTERNET permission too', async () => {
  const dir = copyFixture('android-kotlin');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 0, r.err);
  assert.equal(count(readFileSync(join(dir, 'app/src/main/AndroidManifest.xml'), 'utf8'), INTERNET), 1);
  assert.match(r.out, /app\/src\/main\/AndroidManifest\.xml {2}adds the INTERNET permission/);
});

test('React Native and Expo manifests are not touched (their templates already have INTERNET)', async () => {
  const dir = copyFixture('rn-bare');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /Edited:/);
});

test('INTERNET: --dry-run and a refused run leave the manifest alone', async () => {
  const dir = copyFixture('flutter-app');
  const mf = join(dir, 'android/app/src/main/AndroidManifest.xml');
  const before = readFileSync(mf, 'utf8');
  const dry = await run(['init', dir, '--key', KEY, '--host', HOST, '--dry-run']);
  assert.equal(dry.code, 0, dry.err);
  assert.equal(readFileSync(mf, 'utf8'), before);
  assert.match(dry.out, /Would edit:\n {2}android\/app\/src\/main\/AndroidManifest\.xml {2}adds the INTERNET permission/);
  assert.match(dry.out, /\+ {4}<uses-permission android:name="android\.permission\.INTERNET" \/>/);
  writeFileSync(join(dir, 'lib/links.dart'), '// mine\n');
  const refused = await run(['init', dir, '--key', KEY, '--host', HOST]);
  assert.equal(refused.code, 2);
  assert.equal(readFileSync(mf, 'utf8'), before);
});

test('Flutter with no manifest found: the printed manifest step carries the permission', async () => {
  const dir = copyFixture('unknown');
  const r = await run(['init', dir, '--key', KEY, '--host', HOST, '--framework', 'flutter', '--scheme', 'acmeflutter', '--dry-run']);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes(INTERNET), r.out);
  assert.doesNotMatch(r.out, /Would edit:/);
});

test('addInternetPermission: inserts after a multi-line <manifest>, keeps CRLF, skips one already there, ignores a commented-out one', () => {
  const multi = '<?xml version="1.0" encoding="utf-8"?>\r\n<manifest\r\n    xmlns:android="http://schemas.android.com/apk/res/android"\r\n    package="a.b">\r\n\r\n    <application />\r\n</manifest>\r\n';
  assert.equal(
    addInternetPermission(multi),
    '<?xml version="1.0" encoding="utf-8"?>\r\n<manifest\r\n    xmlns:android="http://schemas.android.com/apk/res/android"\r\n    package="a.b">\r\n    <uses-permission android:name="android.permission.INTERNET" />\r\n\r\n    <application />\r\n</manifest>\r\n',
  );
  assert.equal(addInternetPermission('<manifest>\n  <uses-permission\n      android:name="android.permission.INTERNET"/>\n</manifest>'), null);
  const commented = '<manifest>\n<!-- <uses-permission android:name="android.permission.INTERNET" /> -->\n</manifest>';
  assert.equal(count(addInternetPermission(commented), INTERNET), 2);
  assert.equal(addInternetPermission('not a manifest'), null);
  assert.equal(addInternetPermission('<!-- <manifest> -->\n<manifest a="1">\n</manifest>'), '<!-- <manifest> -->\n<manifest a="1">\n    ' + INTERNET + '\n</manifest>');
});
