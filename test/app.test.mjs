// `strait app`, `strait app verify`, and `strait doctor` with a secret key (docs/adr/0003, engine ADR 0108).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/cli.mjs';
import { HOST, sink } from './helpers.mjs';

const SECRET = 'st_live_0123456789abcdef0123456789abcdef';

// Shapes as the engine sends them (ops/run-1109/app-config-api/prod-endpoints.txt).
const SETUP = {
  android: { packageName: 'com.acme.shop', sha256Fingerprints: ['AA:BB'], scheme: 'acmeshop', appLinksReady: true },
  ios: { teamId: 'TEAM123456', bundleId: 'com.acme.shop', appId: 'TEAM123456.com.acme.shop', appStoreId: null, appClipBundleId: null, universalLinksReady: true },
  domains: [
    { host: 'acme.strait.link', kind: 'link', files: [
      { platform: 'android', url: 'https://acme.strait.link/.well-known/assetlinks.json', served: true, since: '2026-11-05T13:26:34.907Z' },
      { platform: 'ios', url: 'https://acme.strait.link/.well-known/apple-app-site-association', served: false, since: '2026-11-05T13:26:34.907Z' },
    ] },
    { host: 'go.acme.com', kind: 'custom', files: [{ platform: 'android', url: 'https://go.acme.com/.well-known/assetlinks.json', served: null, since: null }] },
  ],
  filesCheckedAt: '2026-11-09T17:37:21.46+00:00',
  sdk: {
    android: { sdk: 'android', version: '0.10.4', reported: 'android/0.10.4', versionSeenAt: '2026-11-09T16:47:55.583Z', lastSeenAt: '2026-11-09T17:43:42.214Z' },
    ios: { sdk: null, version: null, reported: null, versionSeenAt: null, lastSeenAt: '2026-11-09T17:43:37.955Z' },
    web: null,
  },
  sdkWindow: { days: 30, newestOpens: 1000 },
  setupUrl: 'https://app.straitlink.in/setup#apps',
};

const check = (id, status, title, fix = null, detail = '') => ({ id, status, title, detail, fix });
const verifyAnswer = (checks) => {
  const n = (s) => checks.filter((c) => c.status === s).length;
  return { ok: n('fail') === 0 && n('unknown') === 0, checkedAt: '2026-11-09T17:44:14.217Z', summary: { pass: n('pass'), warn: n('warn'), fail: n('fail'), unknown: n('unknown'), skip: n('skip') }, checks };
};
const ALL_GOOD = verifyAnswer([
  check('android_app', 'pass', 'Android app details are complete'),
  check('ios_app', 'pass', 'iPhone app details are complete'),
  check('sdk_connected', 'pass', 'Your app is talking to Strait'),
  check('webhooks', 'skip', 'No webhooks set up', null, 'Optional.'),
]);
const ONE_FAIL = verifyAnswer([
  check('android_app', 'fail', 'Android signing fingerprint missing', 'Copy the SHA-256 fingerprint of the key that signs your app.', 'The package com.acme.shop is saved, but no valid SHA-256 signing fingerprint.'),
  check('ios_app', 'pass', 'iPhone app details are complete'),
  check('sdk_current.ios.unversioned', 'warn', 'Your iPhone build runs a Strait SDK from before 5 Nov 2026', 'Update the Strait SDK and ship a new build.'),
]);

/** The engine (by path) and the link host's well-known files; records every call. */
function world({ app = () => Response.json(SETUP), verify = () => Response.json(ALL_GOOD) } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: u, headers: init.headers ?? {} });
    if (u.pathname === '/v1/app') return app(u);
    if (u.pathname === '/v1/app/verify') return verify(u);
    if (u.pathname === '/.well-known/assetlinks.json')
      return Response.json([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.acme.shop', sha256_cert_fingerprints: ['AA:BB'] } }]);
    if (u.pathname === '/.well-known/apple-app-site-association') return Response.json({ applinks: { details: [{ appIDs: ['TEAM123456.com.acme.shop'] }] } });
    throw new TypeError('fetch failed');
  };
  fn.calls = calls;
  return fn;
}

const run = async (args, { env = { STRAIT_SECRET_KEY: SECRET }, fetch = world() } = {}) => {
  const stdout = sink();
  const stderr = sink();
  const code = await main(args, { stdout, stderr, env, isTTY: false, fetch });
  assert.ok(!stdout.text.includes(SECRET) && !stderr.text.includes(SECRET), 'the secret key is never printed');
  return { code, out: stdout.text, err: stderr.text, fetch };
};

test('strait app: the setup the engine sees, from GET /v1/app with the secret key; exit 0', async () => {
  const r = await run(['app']);
  assert.equal(r.code, 0, r.err);
  const call = r.fetch.calls.find((c) => c.url.pathname === '/v1/app');
  assert.equal(call.url.origin, 'https://strait.link');
  assert.equal(call.headers.authorization, `Bearer ${SECRET}`);
  assert.match(r.out, /Android\s+com\.acme\.shop/);
  assert.match(r.out, /AA:BB/);
  assert.match(r.out, /scheme acmeshop/);
  assert.match(r.out, /iPhone\s+TEAM123456\.com\.acme\.shop/);
  assert.match(r.out, /acme\.strait\.link \(link\)[^\n]*Android file served[^\n]*iPhone file NOT served/);
  assert.match(r.out, /go\.acme\.com \(custom\)[^\n]*Android file not checked yet/);
  assert.match(r.out, /Android\s+android\/0\.10\.4, last app open 2026-11-09/);
  assert.match(r.out, /iPhone\s+no SDK version sent, last app open 2026-11-09/);
  assert.match(r.out, /Web\s+not seen/);
  assert.match(r.out, /https:\/\/app\.straitlink\.in\/setup#apps/);
  assert.match(r.out, /strait app verify/);
});

test('strait app with no app saved says so and where to add one', async () => {
  const r = await run(['app'], { fetch: world({ app: () => Response.json({ ...SETUP, android: null, ios: null, domains: [] }) }) });
  assert.equal(r.code, 0);
  assert.match(r.out, /Android\s+not set up/);
  assert.match(r.out, /iPhone\s+not set up/);
});

test('strait app --json: the API answer as is', async () => {
  const r = await run(['app', '--json']);
  assert.equal(r.code, 0);
  assert.deepEqual(JSON.parse(r.out), SETUP);
});

test('strait app verify: one line per check, all ok, exit 0', async () => {
  const r = await run(['app', 'verify']);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.fetch.calls.some((c) => c.url.pathname === '/v1/app/verify'));
  assert.match(r.out, /pass\s+Android app details are complete/);
  assert.match(r.out, /skip\s+No webhooks set up/);
  assert.match(r.out, /3 pass, 0 warn, 0 fail, 0 unknown, 1 skip/);
  assert.match(r.out, /All checks passed/);
});

test('strait app verify: a failure shows what is wrong and the fix; exit 1', async () => {
  const r = await run(['app', 'verify'], { fetch: world({ verify: () => Response.json(ONE_FAIL) }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /fail\s+Android signing fingerprint missing\n\s+The package com\.acme\.shop is saved/);
  assert.match(r.out, /Fix: Copy the SHA-256 fingerprint/);
  assert.match(r.out, /warn\s+Your iPhone build runs a Strait SDK from before 5 Nov 2026\n[^\n]*Fix: Update the Strait SDK/);
  assert.match(r.out, /1 check failed/);
});

test('strait app verify: an unknown is not a pass; exit 1 (the engine\'s ok rule)', async () => {
  const r = await run(['app', 'verify'], { fetch: world({ verify: () => Response.json(verifyAnswer([check('webhooks', 'unknown', 'Are your webhooks delivering?', 'Run this check again in a minute.', 'Could not check just now.')])) }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /unknown\s+Are your webhooks delivering\?/);
  assert.match(r.out, /Fix: Run this check again in a minute\./);
  assert.match(r.out, /1 check could not run/);
});

test('strait app verify --json: the engine answer as is, exit code from ok', async () => {
  const good = await run(['app', 'verify', '--json']);
  assert.equal(good.code, 0);
  assert.deepEqual(JSON.parse(good.out), ALL_GOOD);
  const bad = await run(['app', 'verify', '--json'], { fetch: world({ verify: () => Response.json(ONE_FAIL) }) });
  assert.equal(bad.code, 1);
  assert.equal(JSON.parse(bad.out).ok, false);
});

test('strait app: no key, or a publishable key, is a usage error (exit 2) that says where to get one', async () => {
  const none = await run(['app', 'verify'], { env: {} });
  assert.equal(none.code, 2);
  assert.match(none.err, /Settings → Secret keys/);
  assert.equal(none.fetch.calls.length, 0);
  const pub = await run(['app'], { env: { STRAIT_SECRET_KEY: 'st_pub_live_0123456789abcdef' } });
  assert.equal(pub.code, 2);
  assert.match(pub.err, /publishable key/);
});

test('strait app verify: the engine refusing the key (links-only, 403) is exit 1 with its message, key redacted', async () => {
  const r = await run(['app', 'verify'], { fetch: world({ verify: () => Response.json({ error: `this key (${SECRET}) can only manage links` }, { status: 403 }) }) });
  assert.equal(r.code, 1);
  assert.match(r.err, /can only manage links \(HTTP 403\)/);
});

test('strait app: engine text is printed without terminal control characters', async () => {
  const evil = verifyAnswer([check('x', 'fail', 'bad\u001b[2Jtitle', 'fix\u0007me')]);
  const r = await run(['app', 'verify'], { fetch: world({ verify: () => Response.json(evil) }) });
  assert.doesNotMatch(r.out, /[\u0000-\u0009\u000b-\u001f\u007f]/);
  assert.match(r.out, /bad\[2Jtitle/);
});

test('an answer that is not JSON is exit 1 with a message, in app and in doctor', async () => {
  const html = () => new Response('<html>proxy</html>', { status: 200 });
  const r = await run(['app', 'verify'], { fetch: world({ verify: html }) });
  assert.equal(r.code, 1);
  assert.match(r.err, /not JSON/);
  const d = await run(['doctor'], { fetch: world({ verify: html }) });
  assert.equal(d.code, 1);
  assert.match(d.out, /Could not check: .*not JSON/);
});

test('strait app takes only verify', async () => {
  const r = await run(['app', 'setup'], { env: {} });
  assert.equal(r.code, 2);
  assert.doesNotMatch(r.err, /secret key/, 'the subcommand is checked before the key');
  assert.match(r.err, /strait app verify/);
});

// doctor + a secret key: the host's files from outside, then the account checks from the engine.
test('doctor with a secret key also runs app verify and prints each check with its fix', async () => {
  const r = await run(['doctor', '--host', HOST, '--android', 'com.acme.shop'], { fetch: world({ verify: () => Response.json(ONE_FAIL) }) });
  assert.equal(r.code, 1, 'an account check failed');
  assert.match(r.out, /ok\s+app\.listed\s+acme\.strait\.link lists com\.acme\.shop/);
  assert.doesNotMatch(r.out, /Fix the errors above/, "the host's own verdict is about the host");
  assert.match(r.out, /Account \(strait app verify\)/);
  assert.match(r.out, /fail\s+Android signing fingerprint missing/);
  assert.match(r.out, /Fix: Copy the SHA-256 fingerprint/);
});

test('doctor with a secret key and no --host: account checks only', async () => {
  const r = await run(['doctor']);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.fetch.calls.some((c) => c.url.pathname.startsWith('/.well-known/')));
  assert.match(r.out, /pass\s+Android app details are complete/);
  assert.match(r.out, /All checks passed/);
});

test('doctor --json with a secret key: { ok, host, android, verify }', async () => {
  const r = await run(['doctor', '--host', HOST, '--android', 'com.acme.shop', '--json']);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, true);
  assert.equal(j.host, HOST);
  assert.deepEqual(j.verify, ALL_GOOD);
  const bad = JSON.parse((await run(['doctor', '--json'], { fetch: world({ verify: () => Response.json(ONE_FAIL) }) })).out);
  assert.equal(bad.ok, false);
});

test('doctor: a key the engine refuses is "could not check", never a silent pass; exit 1', async () => {
  const r = await run(['doctor', '--host', HOST], { fetch: world({ verify: () => Response.json({ error: 'invalid API key' }, { status: 401 }) }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /Could not check: .*invalid API key \(HTTP 401\)/);
  const j = JSON.parse((await run(['doctor', '--json'], { fetch: world({ verify: () => Response.json({ error: 'invalid API key' }, { status: 401 }) }) })).out);
  assert.equal(j.ok, false);
  assert.match(j.verify.error, /invalid API key/);
});

test('doctor: a malformed STRAIT_SECRET_KEY is reported, the host checks still run', async () => {
  const r = await run(['doctor', '--host', HOST], { env: { STRAIT_SECRET_KEY: 'st_pub_live_0123456789abcdef' } });
  assert.equal(r.code, 1);
  assert.match(r.out, /Could not check: .*publishable key/);
  assert.ok(r.fetch.calls.some((c) => c.url.pathname.startsWith('/.well-known/')));
  assert.ok(!r.fetch.calls.some((c) => c.url.pathname.startsWith('/v1/')));
});

test('doctor without a secret key never calls the engine', async () => {
  const r = await run(['doctor', '--host', HOST], { env: {} });
  assert.ok(!r.fetch.calls.some((c) => c.url.pathname.startsWith('/v1/')));
  assert.doesNotMatch(r.out, /Account/);
});
