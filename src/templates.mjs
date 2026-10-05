// What `strait init` writes and prints, per framework. Every snippet mirrors the
// docs (site/content/docs/sdks/*) so the two never disagree. Install lines come
// from src/install.mjs only.
import { join } from 'node:path';
import { PACKAGES, VERSIONS, installSpecs } from './install.mjs';

const HEADER = (pkg, version) => `Created by \`strait init\` (${pkg} ${version}). Safe to edit.`;

// ---------- integration files ----------

function rnLinks({ key, host }, { withRouting }) {
  return `// ${HEADER(PACKAGES.reactNative, VERSIONS.rnVersion)}
// Import this file once from your entry file (index.js) so the launch link is caught.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PlayInstallReferrer } from 'react-native-play-install-referrer';
import { createStrait, fromPlayInstallReferrer } from '${PACKAGES.reactNative}';

export const links = createStrait({
  publishableKey: '${key}', // safe in apps; never the secret key
  endpoint: 'https://${host}', // your workspace's link domain
  storage: AsyncStorage, // required for reliable analytics
  installReferrer: fromPlayInstallReferrer(PlayInstallReferrer),
});
${
  withRouting
    ? `
// Every link arrives here: app opened from a link, browser hand-off, and the
// first open after an install (kind: 'deferred'). Past events replay to late
// subscribers, so your navigator can subscribe after start().
links.onLink((e) => {
  console.log('Strait link:', e.kind, e.route, e.matched, e.path);
  if (e.matched && e.path) {
    // Open the screen for e.path with e.params, for example:
    // navigationRef.navigate(screenFor(e.path), e.params);
  }
});
`
    : `
// Routing lives in app/_layout.tsx (links.onLink). This log helps while you set up.
links.onLink((e) => console.log('Strait link:', e.kind, e.route, e.matched, e.path));
`
}
links.start();
`;
}

const NATIVE_INTENT = `// ${HEADER(PACKAGES.reactNative, VERSIONS.rnVersion)}
// Links reach the app through Strait's onLink (app/_layout.tsx), which knows the
// real destination. Keep Expo Router from routing the raw link URL.
// If your app has other deep links of its own (a sign-in callback), return \`path\` for those.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return '/';
}
`;

function flutterLinks({ key, host }) {
  const f = PACKAGES.flutter;
  return `// ${HEADER(f, VERSIONS.flutterVersion)}
// Call \`await startLinks();\` in main() before runApp.
import 'dart:async';
import 'dart:io' show Platform;
import 'dart:ui';

import 'package:app_links/app_links.dart';
import 'package:${f}/${f}.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:play_install_referrer/play_install_referrer.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persists the once-per-install flag and unsent open reports.
class PrefsStore implements KeyValueStore {
  PrefsStore(this.prefs);
  final SharedPreferences prefs;
  @override
  Future<String?> get(String key) async => prefs.getString(key);
  @override
  Future<void> set(String key, String value) => prefs.setString(key, value);
}

/// Feeds Flutter lifecycle changes to the SDK.
class LifecycleFeed with WidgetsBindingObserver {
  final _ctl = StreamController<AppLifecycle>.broadcast(sync: true);
  Stream<AppLifecycle> get stream => _ctl.stream;
  LifecycleFeed() { WidgetsBinding.instance.addObserver(this); }
  @override
  void didChangeAppLifecycleState(AppLifecycleState s) => _ctl.add(switch (s) {
        AppLifecycleState.resumed => AppLifecycle.active,
        AppLifecycleState.inactive => AppLifecycle.inactive,
        _ => AppLifecycle.background,
      });
}

late final StraitLinks links;

Future<void> startLinks() async {
  WidgetsFlutterBinding.ensureInitialized();
  final timezone = await FlutterTimezone.getLocalTimezone(); // IANA, e.g. Asia/Kolkata
  links = StraitLinks(
    publishableKey: '${key}', // safe in apps; never the secret key
    endpoint: 'https://${host}', // your workspace's link domain
    platform: Platform.isIOS ? 'ios' : Platform.isAndroid ? 'android' : 'other',
    storage: PrefsStore(await SharedPreferences.getInstance()),
    installReferrer: () async =>
        Platform.isAndroid ? (await PlayInstallReferrer.installReferrer).installReferrer : null,
    deviceFields: () {
      final view = PlatformDispatcher.instance.views.first;
      return DeviceFields(
        screenWidth: portraitScreenWidth(view.physicalSize.width / view.devicePixelRatio, view.physicalSize.height / view.devicePixelRatio),
        pixelRatio: view.devicePixelRatio,
        language: PlatformDispatcher.instance.locale.toLanguageTag(),
        timezone: timezone,
      );
    },
  );

  // Every link arrives here: app opened from a link, browser hand-off, and the
  // first open after an install.
  links.onLink.listen((e) {
    debugPrint('Strait link: \${e.kind.name} \${e.route.value} \${e.matched} \${e.path}');
    if (e.matched && e.path != null) {
      // Open the screen for e.path with e.params, for example:
      // navigatorKey.currentState?.pushNamed(e.path!, arguments: e.params);
    }
  });

  final appLinks = AppLinks();
  await links.start(
    initialUrl: (await appLinks.getInitialLink())?.toString(),
    urls: appLinks.uriLinkStream.map((u) => u.toString()),
    lifecycle: LifecycleFeed().stream,
  );
}
`;
}

function androidLinks({ key, host }, pkg) {
  return `// ${HEADER(PACKAGES.android, VERSIONS.androidVersion)}
package ${pkg}

import android.app.Application
import android.content.Context
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import dev.strait.sdk.AppLifecycleState
import dev.strait.sdk.DeviceFields
import dev.strait.sdk.KeyValueStore
import dev.strait.sdk.StraitClient
import dev.strait.sdk.StraitConfig
import dev.strait.sdk.portraitScreenWidth

/** Call StraitLinks.init(this) from your Application's onCreate(). */
object StraitLinks {
    lateinit var client: StraitClient
        private set

    fun init(app: Application) {
        val prefs = app.getSharedPreferences("links", Context.MODE_PRIVATE)
        client = StraitClient(StraitConfig(
            publishableKey = "${key}",          // safe in apps; never the secret key
            endpoint = "https://${host}",       // your workspace's link domain
            storage = object : KeyValueStore {
                override fun get(key: String) = prefs.getString(key, null)
                override fun set(key: String, value: String) { prefs.edit().putString(key, value).apply() }
            },
            installReferrer = { readInstallReferrer(app) },
            device = {
                val m = app.resources.displayMetrics
                DeviceFields(
                    screenWidth = portraitScreenWidth(m.widthPixels / m.density.toDouble(), m.heightPixels / m.density.toDouble()),
                    pixelRatio = m.density.toDouble(),
                    language = java.util.Locale.getDefault().toLanguageTag(),
                    timezone = java.util.TimeZone.getDefault().id,
                )
            },
            // Network calls block the calling thread; listeners run here too.
            executor = java.util.concurrent.Executors.newSingleThreadExecutor(),
        ))

        ProcessLifecycleOwner.get().lifecycle.addObserver(LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_RESUME -> client.onAppState(AppLifecycleState.ACTIVE)
                Lifecycle.Event.ON_PAUSE -> client.onAppState(AppLifecycleState.INACTIVE)
                Lifecycle.Event.ON_STOP -> client.onAppState(AppLifecycleState.BACKGROUND)
                else -> Unit
            }
        })
    }
}

/** The Play Install Referrer: how a link tapped before the install reaches the app. */
fun readInstallReferrer(context: Context): String? {
    val latch = java.util.concurrent.CountDownLatch(1)
    var result: String? = null
    val client = InstallReferrerClient.newBuilder(context).build()
    try {
        client.startConnection(object : InstallReferrerStateListener {
            override fun onInstallReferrerSetupFinished(code: Int) {
                if (code == InstallReferrerClient.InstallReferrerResponse.OK) {
                    result = runCatching { client.installReferrer.installReferrer }.getOrNull()
                }
                latch.countDown()
            }
            override fun onInstallReferrerServiceDisconnected() { latch.countDown() }
        })
        latch.await(5, java.util.concurrent.TimeUnit.SECONDS)
    } catch (_: Exception) {
    } finally {
        runCatching { client.endConnection() }
    }
    return result
}
`;
}

/** The files `strait init` writes, as [{ path (relative), contents, why }]. */
export function integrationFiles(project, opts) {
  const ext = project.typescript ? 'ts' : 'js';
  switch (project.framework) {
    case 'react-native':
      return [{ path: `links.${ext}`, contents: rnLinks(opts, { withRouting: true }), why: 'creates the client and handles every link' }];
    case 'expo': {
      const files = [{ path: `links.${ext}`, contents: rnLinks(opts, { withRouting: !project.expoRouter }), why: 'creates the client' }];
      if (project.expoRouter) files.push({ path: 'app/+native-intent.tsx', contents: NATIVE_INTENT, why: 'stops Expo Router routing the raw link URL' });
      return files;
    }
    case 'flutter':
      return [{ path: 'lib/links.dart', contents: flutterLinks(opts), why: 'creates the client and handles every link' }];
    case 'android': {
      const pkg = project.androidPackage ?? 'com.example.app';
      const root = project.sourceRoot ? project.sourceRoot.slice(project.dir.length + 1) : 'app/src/main/java';
      return [{ path: join(root, ...pkg.split('.'), 'StraitLinks.kt'), contents: androidLinks(opts, pkg), why: 'creates the client and reads the Play Install Referrer' }];
    }
    default:
      throw new Error(`unknown framework ${project.framework}`);
  }
}

// ---------- printed steps ----------

export function manifestXml({ host, scheme }) {
  return `<activity android:name=".MainActivity" android:launchMode="singleTask" android:exported="true">
  <!-- Verified links: https://${host}/… opens the app directly -->
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="${host}" />
  </intent-filter>
  <!-- Browser hand-off: ${scheme}://shop.example.com/product/42 -->
  <intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="${scheme}" />
  </intent-filter>
</activity>`;
}

function expoAppJson({ host, scheme }, project) {
  return JSON.stringify(
    {
      expo: {
        scheme,
        android: {
          package: project.androidPackage ?? 'com.yourcompany.yourapp',
          intentFilters: [{ action: 'VIEW', autoVerify: true, data: [{ scheme: 'https', host }], category: ['BROWSABLE', 'DEFAULT'] }],
        },
        ios: { bundleIdentifier: project.iosBundleId ?? 'com.yourcompany.yourapp', associatedDomains: [`applinks:${host}`] },
      },
    },
    null,
    2,
  );
}

const EXPO_LAYOUT = `import { Stack, router, useRootNavigationState, type Href } from 'expo-router';
import { useEffect } from 'react';
import { links } from '../links';

export default function RootLayout() {
  const ready = useRootNavigationState()?.key;
  useEffect(() => {
    if (!ready) return;
    // Opened from a link, or first open after install: same callback.
    return links.onLink((e) => {
      if (e.matched && e.path) router.push({ pathname: e.path, params: e.params } as Href);
    });
  }, [ready]);
  return <Stack />;
}`;

const keytool = (fw) =>
  fw === 'expo'
    ? 'keytool -list -v -keystore android/app/debug.keystore -storepass android | grep SHA256   # local builds; EAS builds: eas credentials'
    : fw === 'flutter' || fw === 'android'
      ? 'keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA256'
      : 'keytool -list -v -keystore android/app/debug.keystore -storepass android | grep SHA256';

/**
 * The steps printed after the files are written: [{ title, body, code?, lang? }].
 * `done` marks a step the project already has.
 */
export function nextSteps(project, opts, installSrc) {
  const { host, scheme } = opts;
  const inst = installSpecs(installSrc);
  const pkg = project.androidPackage ?? 'com.yourcompany.yourapp';
  const hasHost = project.manifest.hosts.includes(host);
  const hasScheme = project.manifest.schemes.includes(scheme);
  const steps = [];
  const fw = project.framework;

  // 1. Install
  if (fw === 'react-native') {
    steps.push({ title: 'Install the SDK', done: project.sdkInstalled, code: `npm install ${inst.reactNative} @react-native-async-storage/async-storage react-native-play-install-referrer`, lang: 'bash' });
  } else if (fw === 'expo') {
    steps.push({ title: 'Install the SDK', done: project.sdkInstalled, code: `npm install ${inst.reactNative}\nnpx expo install @react-native-async-storage/async-storage react-native-play-install-referrer`, lang: 'bash' });
  } else if (fw === 'flutter') {
    steps.push({ title: 'Add the SDK to pubspec.yaml, then the helper packages', done: project.sdkInstalled, code: `dependencies:\n${inst.flutterPubspec}\n\n# then:\nflutter pub add app_links shared_preferences play_install_referrer flutter_timezone`, lang: 'yaml' });
  } else {
    const repo = inst.androidRepository ? `// settings.gradle.kts → dependencyResolutionManagement.repositories\nmaven("${inst.androidRepository}")\n\n` : '';
    steps.push({ title: 'Add the dependencies', done: project.sdkInstalled, code: `${repo}// app/build.gradle.kts → dependencies\nimplementation("${inst.android}")\nimplementation("com.android.installreferrer:installreferrer:2.2")\nimplementation("androidx.lifecycle:lifecycle-process:2.8.7")`, lang: 'kotlin' });
  }

  // 2. Start it
  if (fw === 'react-native') steps.push({ title: 'Load links at startup', body: `Add \`import './links';\` to the top of index.js, then rebuild (npx react-native run-android). The SDK adds a native module, so a Metro reload is not enough.` });
  if (fw === 'expo') {
    steps.push({ title: 'Add link settings to app.json (merge with what you have)', code: expoAppJson(opts, project), lang: 'json', body: project.dynamicConfig ? 'Your config is app.config.js/ts, so copy these keys into it by hand.' : undefined });
    if (project.expoRouter) steps.push({ title: 'Route links in app/_layout.tsx', code: EXPO_LAYOUT, lang: 'tsx' });
    else steps.push({ title: 'Load links at startup', body: "Add `import './links';` to your entry file." });
    steps.push({ title: 'Make a development build (Expo Go cannot load the native module)', code: 'npx expo run:android     # or: eas build --profile development --platform android', lang: 'bash' });
  }
  if (fw === 'flutter') steps.push({ title: 'Start links in main()', code: "import 'links.dart';\n\nFuture<void> main() async {\n  await startLinks();\n  runApp(const MyApp());\n}", lang: 'dart' });
  if (fw === 'android') {
    steps.push({ title: 'Initialise it in your Application', code: 'class App : Application() {\n    override fun onCreate() {\n        super.onCreate()\n        StraitLinks.init(this)\n    }\n}\n// AndroidManifest.xml: <application android:name=".App" …>', lang: 'kotlin' });
    steps.push({ title: 'Pass links from MainActivity', code: 'override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(savedInstanceState)\n    val links = StraitLinks.client\n    links.onLink { e -> runOnUiThread { if (e.matched) navigate(e.path, e.params) } }\n    if (savedInstanceState == null) links.start(intent?.dataString)\n}\n\noverride fun onNewIntent(intent: Intent) {\n    super.onNewIntent(intent)\n    intent.dataString?.let(StraitLinks.client::handleUrl) // app was already running\n}', lang: 'kotlin' });
  }

  // 3. Manifest
  if (fw !== 'expo') {
    const where = fw === 'android' ? 'app/src/main/AndroidManifest.xml' : 'android/app/src/main/AndroidManifest.xml';
    const flutterMeta = '<!-- Flutter only, inside <activity>: let the SDK handle links -->\n<meta-data android:name="flutter_deeplinking_enabled" android:value="false" />';
    const needsFlutterMeta = fw === 'flutter' && !project.manifest.flutterDeepLinkingOff;
    const filtersDone = hasHost && hasScheme;
    const done = filtersDone && !needsFlutterMeta;
    steps.push({
      title: `Add the intent filters to ${where}`,
      done,
      body: done
        ? `Already there: ${host} and ${scheme}://.`
        : filtersDone
          ? `The intent filters for ${host} and ${scheme}:// are already there. Add this line inside your main activity:`
          : 'Inside your main activity. Keep the intent filters you already have.',
      code: done ? undefined : [filtersDone ? null : manifestXml(opts), needsFlutterMeta ? flutterMeta : null].filter(Boolean).join('\n'),
      lang: 'xml',
    });
    steps.push({ title: 'iPhone (beta)', body: `In Xcode add Associated Domains → applinks:${host}, and ${scheme} under Info → URL Types.${fw === 'flutter' ? ' Set FlutterDeepLinkingEnabled = NO in Info.plist.' : ''}` });
  }

  // 4. Dashboard + verification files
  steps.push({
    title: 'Fill in Dashboard → Settings',
    body: `Package name ${pkg}, custom scheme ${scheme}, and the SHA-256 fingerprint of every certificate your app is signed with (debug, upload, and Play App Signing from Play Console → App integrity). For iPhone (beta), your Apple Team ID and bundle ID.`,
    code: keytool(fw),
    lang: 'bash',
  });
  steps.push({
    title: 'Check the verification files your link domain serves',
    body: 'Each returns 404 until the matching Settings fields are filled in. assetlinks.json lets Android open https links in the app directly; apple-app-site-association does the same on iPhone (beta).',
    code: `curl https://${host}/.well-known/assetlinks.json\ncurl https://${host}/.well-known/apple-app-site-association`,
    lang: 'bash',
  });

  // 5. Try it
  steps.push({
    title: 'Try it',
    body: 'Rebuild and install the app, then run this. Your log shows a "Strait link:" line. After that, tap a real link from Messages or Gmail.',
    code: `adb shell am start -W -a android.intent.action.VIEW -d "${scheme}://shop.example.com/product/42"\nadb shell pm get-app-links ${pkg}   # look for ${host}: verified`,
    lang: 'bash',
  });
  return steps;
}
