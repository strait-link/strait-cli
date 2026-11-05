// `strait events add <name>`: prints ready-to-paste tracking code (ADR 0001). Each snippet is the
// SDK's own call, read from its source on 5 Nov 2026:
//   React Native 0.10  links.trackEvent(name, { value, currency, eventId })        src/strait.ts
//   Flutter 0.9        links.trackEvent(name, value:, currency:, linkId:, clickId:) lib/src/client.dart (no eventId)
//   iOS 0.10           strait.trackEvent(_:value:currency:linkId:clickId:eventId:completion:)  StraitLinks.swift
//   Android 0.8        client.trackEvent(name, value, currency, linkId, clickId, eventId)  StraitClient.kt (blocks)
//   Web (Unreleased)   trackEvent(config, name, { value, currency, eventId })   src/index.ts (sdk-web ADR 0002)
// `links` / `StraitLinks.client` are the names `strait init` writes (templates.mjs).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { detectProject } from './detect.mjs';
import { PACKAGES, VERSIONS } from './install.mjs';
import { UsageError, normalizeHost } from './validate.mjs';

export const PLATFORMS = ['react-native', 'flutter', 'ios', 'android', 'web'];
const LABEL = { 'react-native': 'React Native', flutter: 'Flutter', ios: 'iOS (Swift)', android: 'Android (Kotlin)', web: 'Web' };
// The engine takes any name up to 64 characters; this subset can't break or inject into the printed code.
const NAME = /^[A-Za-z0-9_.:-](?:[A-Za-z0-9 _.:-]{0,62}[A-Za-z0-9_.:-])?$/;

/** The platform for a folder from its files, or null. Expo uses the React Native SDK. */
export function detectPlatform(dir) {
  const p = detectProject(dir);
  if (p) return { platform: p.framework === 'expo' ? 'react-native' : p.framework, sdkInstalled: p.sdkInstalled };
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  if (names.includes('Package.swift') || names.some((n) => n.endsWith('.xcodeproj') || n.endsWith('.xcworkspace'))) return { platform: 'ios', sdkInstalled: null };
  if (existsSync(join(dir, 'package.json'))) return { platform: 'web', sdkInstalled: null };
  return null;
}

/** @returns {string} what to print */
export function eventsCommand(sub, positionals, v, { dir, env }) {
  const usage = 'Usage: strait events add <name> [dir] [--platform react-native|flutter|ios|android|web]';
  if (sub !== 'add') throw new UsageError(`${usage}${sub ? ` ("${sub}" is not a subcommand)` : ''}`);
  const [name] = positionals;
  if (name === undefined) throw new UsageError(usage);
  if (!NAME.test(name)) {
    throw new UsageError('That event name would break the code. Use 1-64 letters, numbers, spaces and _ . : - (for example purchase or sign_up).');
  }
  let platform = v.platform?.trim().toLowerCase();
  let sdkInstalled = null;
  if (platform && !PLATFORMS.includes(platform)) throw new UsageError(`--platform is one of ${PLATFORMS.join(', ')}, not "${v.platform}".`);
  if (!platform) {
    const found = detectPlatform(dir);
    if (!found) throw new UsageError(`No app found in ${dir}. Pass --platform react-native|flutter|ios|android|web.`);
    ({ platform, sdkInstalled } = found);
  }
  // Only values that can't break the quoted string go into the code; anything else stays a placeholder.
  const envKey = String(env.STRAIT_PUBLISHABLE_KEY ?? '').trim();
  const key = /^st_pub_(live|test)_[A-Za-z0-9]{8,64}$/.test(envKey) ? envKey : 'st_pub_live_…';
  let host = '<your-handle>.strait.link';
  try {
    if (env.STRAIT_LINK_HOST) host = normalizeHost(env.STRAIT_LINK_HOST);
  } catch {
    // keep the placeholder
  }
  const out = [`"${name}" event for ${LABEL[platform]}${v.platform ? '' : ' (detected)'}. Paste it where the action happens:`, '', SNIPPETS[platform](name, { key, host }).trimEnd(), ''];
  if (sdkInstalled === false) out.push('The Strait SDK is not in this project yet: run strait init first, it writes the client this code uses.');
  out.push('Events show in Dashboard → Analytics, on the tap that brought the user (for 7 days).');
  return out.join('\n');
}

const SNIPPETS = {
  'react-native': (n) => `import { links } from './links'; // the client strait init wrote; fix the path for this file

// Resolves true when Strait took it; never throws. For revenue add
// { value: 49.99, currency: 'USD', eventId: order.id } (eventId: a retry is counted once).
await links.trackEvent('${n}');
`,
  flutter: (n) => `import 'links.dart'; // lib/links.dart, the client strait init wrote

// Resolves true when Strait took it; never throws. For revenue add
// value: 49.99, currency: 'USD'
await links.trackEvent('${n}');
`,
  ios: (n) => `// strait: your StraitLinks instance (strait-sdk-swift README, "Use"). Never throws.
// For revenue add value: 49.99, currency: "USD", eventId: order.id (a retry is counted once;
// eventId needs StraitSDK ${VERSIONS.version}+: SwiftPM from: "${VERSIONS.version}").
strait.trackEvent("${n}") { ok in
    // ok == false: not sent now; kept and sent later when it was the network
}
`,
  android: (n) => `// It sends on the calling thread: call it off the main thread. Never throws.
// For revenue add value = 49.99, currency = "USD", eventId = order.id (a retry is counted once;
// eventId needs ${PACKAGES.android} ${VERSIONS.androidVersion}+, what strait init installs).
val ok = StraitLinks.client.trackEvent("${n}")
`,
  web: (n, { key, host }) => `import { reportWebOpen, trackEvent } from '@straitlink/web';

const strait = { publishableKey: '${key}', endpoint: 'https://${host}' };

// On page load: counts the open and remembers the tap this visit came from.
await reportWebOpen(strait);

// Where "${n}" happens. Resolves true when Strait took it; never throws. For revenue add
// { value: 49.99, currency: 'USD', eventId: order.id } (eventId: a repeat is counted once).
await trackEvent(strait, '${n}');
`,
};
