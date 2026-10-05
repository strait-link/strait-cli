// Works out what kind of app lives in a folder, by reading its files only (no
// commands run, nothing written).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const FRAMEWORKS = ['react-native', 'expo', 'flutter', 'android'];
export const LABELS = { 'react-native': 'React Native', expo: 'Expo', flutter: 'Flutter', android: 'Android (Kotlin)' };

const read = (f) => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};
const readJson = (f) => {
  const t = read(f);
  if (t == null) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
};
const first = (dir, names) => names.map((n) => join(dir, n)).find((p) => existsSync(p)) ?? null;

/** applicationId (or namespace) from an app-module Gradle file. */
export function gradlePackage(text) {
  if (!text) return null;
  const m = /\bapplicationId\s*(?:=\s*)?["']([A-Za-z][\w.]*)["']/.exec(text) ?? /\bnamespace\s*(?:=\s*)?["']([A-Za-z][\w.]*)["']/.exec(text);
  return m ? m[1] : null;
}

/** The scheme(s) and hosts already declared in an AndroidManifest.xml. */
export function manifestLinks(text) {
  if (!text) return { schemes: [], hosts: [], flutterDeepLinkingOff: false };
  const schemes = [...text.matchAll(/android:scheme="([^"]+)"/g)].map((m) => m[1]);
  const hosts = [...text.matchAll(/android:host="([^"]+)"/g)].map((m) => m[1]);
  const flutterDeepLinkingOff = /android:name="flutter_deeplinking_enabled"\s+android:value="false"/.test(text);
  return { schemes: [...new Set(schemes)], hosts: [...new Set(hosts)], flutterDeepLinkingOff };
}

/** The Java/Kotlin source root for an Android app module, if it exists. */
function androidSourceRoot(appDir) {
  for (const s of ['src/main/java', 'src/main/kotlin']) {
    const p = join(appDir, s);
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  return null;
}

/**
 * Returns null when the folder holds no app we recognise, otherwise:
 * { framework, label, typescript, expoRouter, appName, androidPackage, iosBundleId,
 *   scheme, manifestPath, manifest: {schemes, hosts}, sdkInstalled, files: {...} }
 */
export function detectProject(dir) {
  const pkg = readJson(join(dir, 'package.json'));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const pubspec = read(join(dir, 'pubspec.yaml'));
  const base = { appName: null, androidPackage: null, iosBundleId: null, scheme: null, typescript: false, expoRouter: false, sdkInstalled: false };

  if (pkg && deps.expo) {
    const app = readJson(join(dir, 'app.json'));
    const expo = app?.expo ?? app ?? {};
    const scheme = Array.isArray(expo.scheme) ? expo.scheme[0] : expo.scheme;
    return finish(dir, {
      ...base,
      framework: 'expo',
      typescript: existsSync(join(dir, 'tsconfig.json')),
      expoRouter: Boolean(deps['expo-router']),
      appName: expo.name ?? pkg.name ?? null,
      androidPackage: expo.android?.package ?? null,
      iosBundleId: expo.ios?.bundleIdentifier ?? null,
      scheme: typeof scheme === 'string' ? scheme : null,
      sdkInstalled: Boolean(deps['@strait/sdk-react-native']),
      dynamicConfig: !app && Boolean(first(dir, ['app.config.js', 'app.config.ts'])),
      androidDir: join(dir, 'android'),
    });
  }
  if (pkg && deps['react-native']) {
    return finish(dir, {
      ...base,
      framework: 'react-native',
      typescript: existsSync(join(dir, 'tsconfig.json')),
      appName: readJson(join(dir, 'app.json'))?.name ?? pkg.name ?? null,
      androidPackage: gradlePackage(read(first(join(dir, 'android/app'), ['build.gradle', 'build.gradle.kts']) ?? '')),
      sdkInstalled: Boolean(deps['@strait/sdk-react-native']),
      androidDir: join(dir, 'android'),
    });
  }
  if (pubspec && /\bsdk:\s*flutter\b/.test(pubspec)) {
    return finish(dir, {
      ...base,
      framework: 'flutter',
      appName: /^name:\s*(\S+)/m.exec(pubspec)?.[1] ?? null,
      androidPackage: gradlePackage(read(first(join(dir, 'android/app'), ['build.gradle', 'build.gradle.kts']) ?? '')),
      sdkInstalled: /^\s{2}strait_sdk:/m.test(pubspec),
      androidDir: join(dir, 'android'),
    });
  }
  const appGradle = first(join(dir, 'app'), ['build.gradle.kts', 'build.gradle']);
  const appGradleText = appGradle ? read(appGradle) : null;
  if (appGradleText && /com\.android\.application|android\.application/.test(appGradleText)) {
    return finish(dir, {
      ...base,
      framework: 'android',
      appName: /rootProject\.name\s*=\s*["']([^"']+)["']/.exec(read(first(dir, ['settings.gradle.kts', 'settings.gradle']) ?? '') ?? '')?.[1] ?? null,
      androidPackage: gradlePackage(appGradleText),
      sdkInstalled: /strait-sdk-android/.test(appGradleText),
      androidDir: dir,
      sourceRoot: androidSourceRoot(join(dir, 'app')),
    });
  }
  return null;
}

function finish(dir, p) {
  const manifestPath = p.androidDir ? first(p.androidDir, ['app/src/main/AndroidManifest.xml']) : null;
  const { androidDir, ...rest } = p;
  return { ...rest, label: LABELS[p.framework], dir, manifestPath, manifest: manifestLinks(manifestPath ? read(manifestPath) : null) };
}

/** Folders are listed in error messages so people can see why nothing matched. */
export function describeFolder(dir) {
  try {
    return readdirSync(dir).filter((n) => !n.startsWith('.')).slice(0, 12).join(', ') || '(empty)';
  } catch {
    return '(missing)';
  }
}
