// THE one place the CLI's SDK install lines come from. Mirrors site/site.config.json
// `install` and dashboard/src/lib/install.ts (test/install.test.mjs fails if they
// drift when the site repo sits next to this one).
//
// - SDK repos moved to an organisation: change `githubOwner`.
// - SDKs published to npm / pub.dev / Maven Central: change `source` to "registry", or per
//   registry { npm, pub, maven } (npm = React Native, pub = Flutter, maven = Android).
//   16 Oct 2026: npm and pub.dev are published; Android stays on JitPack.
// Never spell out the owner anywhere else in this package.

export const INSTALL = {
  source: { npm: 'registry', pub: 'registry', maven: 'github' },
  githubOwner: 'strait-link',
};

/** The source for one registry: `source` as one word applies to all three. */
export const sourceFor = (src, registry) => (typeof src.source === 'string' ? src.source : src.source[registry]);

/**
 * SDK versions the generated code is written for. Must equal site/site.config.json `packages`
 * (the one source of truth; test/install.test.mjs fails if they differ). Bump both together.
 */
export const VERSIONS = {
  version: '0.9.4', // Swift (Unity is not written by this CLI)
  rnVersion: '0.9.3',
  flutterVersion: '0.9.4',
  androidVersion: '0.8.4',
};

export const PACKAGES = {
  reactNative: '@straitlink/react-native',
  flutter: 'strait_sdk',
  android: 'strait-sdk-android',
};

export function installSpecs(src = INSTALL, v = VERSIONS) {
  const o = src.githubOwner;
  const gh = (repo) => `https://github.com/${o}/${repo}`;
  const regNpm = sourceFor(src, 'npm') === 'registry';
  const regPub = sourceFor(src, 'pub') === 'registry';
  const reg = sourceFor(src, 'maven') === 'registry';
  return {
    reactNative: regNpm ? `${PACKAGES.reactNative}@${v.rnVersion}` : `github:${o}/strait-sdk-react-native#v${v.rnVersion}`,
    flutterPubspec: regPub
      ? `  ${PACKAGES.flutter}: ^${v.flutterVersion}`
      : `  ${PACKAGES.flutter}:\n    git:\n      url: ${gh('strait-sdk-flutter')}\n      ref: v${v.flutterVersion}`,
    android: reg ? `in.straitlink:${PACKAGES.android}:${v.androidVersion}` : `com.github.${o}:${PACKAGES.android}:v${v.androidVersion}`,
    /** Extra Gradle repository the Android coordinate needs (null once on Maven Central). */
    androidRepository: reg ? null : 'https://jitpack.io',
  };
}
