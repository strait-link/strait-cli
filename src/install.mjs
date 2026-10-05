// THE one place the CLI's SDK install lines come from. Mirrors site/site.config.json
// `install` and dashboard/src/lib/install.ts (test/install.test.mjs fails if they
// drift when the site repo sits next to this one).
//
// - SDK repos moved to an organisation: change `githubOwner`.
// - SDKs published to npm / pub.dev / Maven Central: change `source` to "registry".
// Never spell out the owner anywhere else in this package.

export const INSTALL = {
  source: 'github',
  githubOwner: 'bazingga08',
};

/** SDK versions the generated code is written for (site.config.json packages). */
export const VERSIONS = {
  version: '0.8.0', // Swift, Unity
  rnVersion: '0.8.1',
  flutterVersion: '0.8.1',
  androidVersion: '0.7.2',
};

export const PACKAGES = {
  reactNative: '@straitlink/react-native',
  flutter: 'strait_sdk',
  android: 'strait-sdk-android',
};

export function installSpecs(src = INSTALL, v = VERSIONS) {
  const o = src.githubOwner;
  const reg = src.source === 'registry';
  const gh = (repo) => `https://github.com/${o}/${repo}`;
  return {
    reactNative: reg ? `${PACKAGES.reactNative}@${v.rnVersion}` : `github:${o}/strait-sdk-react-native#v${v.rnVersion}`,
    flutterPubspec: reg
      ? `  ${PACKAGES.flutter}: ^${v.flutterVersion}`
      : `  ${PACKAGES.flutter}:\n    git:\n      url: ${gh('strait-sdk-flutter')}\n      ref: v${v.flutterVersion}`,
    android: reg ? `in.straitlink:${PACKAGES.android}:${v.androidVersion}` : `com.github.${o}:${PACKAGES.android}:v${v.androidVersion}`,
    /** Extra Gradle repository the Android coordinate needs (null once on Maven Central). */
    androidRepository: reg ? null : 'https://jitpack.io',
  };
}
