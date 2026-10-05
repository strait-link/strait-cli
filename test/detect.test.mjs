import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { detectProject, gradlePackage, manifestLinks } from '../src/detect.mjs';
import { FIXTURES } from './helpers.mjs';

const d = (n) => detectProject(join(FIXTURES, n));

test('bare React Native: TypeScript, package from build.gradle', () => {
  const p = d('rn-bare');
  assert.equal(p.framework, 'react-native');
  assert.equal(p.typescript, true);
  assert.equal(p.androidPackage, 'com.acme.shop');
  assert.equal(p.sdkInstalled, false);
  assert.deepEqual(p.manifest.hosts, []);
});

test('Expo with Expo Router: scheme, package and bundle id from app.json', () => {
  const p = d('expo-router');
  assert.equal(p.framework, 'expo');
  assert.equal(p.expoRouter, true);
  assert.equal(p.scheme, 'acmeexpo');
  assert.equal(p.androidPackage, 'com.acme.expo');
  assert.equal(p.iosBundleId, 'com.acme.expo');
});

test('Expo without router or TypeScript', () => {
  const p = d('expo-js');
  assert.equal(p.framework, 'expo');
  assert.equal(p.expoRouter, false);
  assert.equal(p.typescript, false);
  assert.equal(p.scheme, null);
});

test('Flutter: name from pubspec, existing intent filters seen', () => {
  const p = d('flutter-app');
  assert.equal(p.framework, 'flutter');
  assert.equal(p.appName, 'acme_shop');
  assert.equal(p.androidPackage, 'com.acme.flutter');
  assert.deepEqual(p.manifest.hosts, ['acme.strait.link']);
  assert.ok(p.manifest.schemes.includes('acmeflutter'));
});

test('native Android: package and Kotlin source root', () => {
  const p = d('android-kotlin');
  assert.equal(p.framework, 'android');
  assert.equal(p.androidPackage, 'com.acme.shop');
  assert.match(p.sourceRoot, /app\/src\/main\/java$/);
  assert.equal(p.appName, 'AcmeShop');
});

test('a folder with no app is not recognised', () => {
  assert.equal(d('unknown'), null);
  assert.equal(d('does-not-exist'), null);
});

test('gradlePackage reads Groovy and Kotlin DSL, prefers applicationId', () => {
  assert.equal(gradlePackage('namespace "a.b"\n applicationId "c.d"'), 'c.d');
  assert.equal(gradlePackage('namespace = "a.b"'), 'a.b');
  assert.equal(gradlePackage('applicationId = "x.y.z"'), 'x.y.z');
  assert.equal(gradlePackage('nothing'), null);
  assert.equal(gradlePackage(null), null);
});

test('manifestLinks lists schemes and hosts once each', () => {
  const m = manifestLinks('<data android:scheme="https" android:host="a.b"/><data android:scheme="https" android:host="a.b"/>');
  assert.deepEqual(m, { schemes: ['https'], hosts: ['a.b'], flutterDeepLinkingOff: false });
});

test('React Native SDK counts as installed under its npm name or its pre-rename name', () => {
  for (const name of ['@straitlink/react-native', '@strait/sdk-react-native']) {
    const dir = mkdtempSync(join(tmpdir(), 'strait-detect-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'shop', dependencies: { 'react-native': '0.76.0', [name]: '0.8.0' } }));
    assert.equal(detectProject(dir).sdkInstalled, true, name);
  }
});
