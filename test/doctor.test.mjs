// `strait doctor`: the SDK doctor (contract B23, shared-spec ADR 0002) from a terminal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/cli.mjs';
import { doctorFindings } from '../src/doctor.mjs';
import { HOST, KEY, sink } from './helpers.mjs';

const VECTORS = new URL('./doctor-vectors.json', import.meta.url);
const { vectors } = JSON.parse(readFileSync(VECTORS, 'utf8'));

test('the 43 shared doctor vectors: same ids, severities and wording as the SDKs', () => {
  assert.ok(vectors.length >= 43);
  for (const v of vectors) {
    const { file, appId, ...rest } = v.input;
    const report = doctorFindings({
      ...rest,
      appId: appId ?? undefined,
      file: file === null ? undefined : { status: file.status ?? undefined, body: file.body ?? undefined },
    });
    assert.deepEqual(report, { ok: v.ok, findings: v.findings }, v.name);
  }
});

test('the vectors are a byte-for-byte copy of the React Native SDK (when it sits next to this repo)', (t) => {
  const repos = process.env.STRAIT_REPOS_DIR ?? fileURLToPath(new URL('../..', import.meta.url));
  const rn = join(repos, 'sdk-react-native', 'test', 'doctor-vectors.json');
  if (!existsSync(rn)) return t.skip('sdk-react-native is not checked out next to this repo');
  assert.equal(readFileSync(VECTORS, 'utf8'), readFileSync(rn, 'utf8'));
});

const ASSETLINKS = JSON.stringify([
  { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.acme.shop', sha256_cert_fingerprints: ['AA:BB'] } },
]);
const AASA = JSON.stringify({ applinks: { details: [{ appIDs: ['TEAM123.com.acme.shop'], components: [{ '/': '/*' }] }] } });

/** A fetch that serves the two well-known files for HOST and records what was asked. */
function fakeFetch(files = { 'assetlinks.json': [200, ASSETLINKS], 'apple-app-site-association': [200, AASA] }) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    const name = String(url).split('/.well-known/')[1];
    const f = files[name];
    if (f === 'network') throw new TypeError('fetch failed');
    const [status, body] = f ?? [404, 'not found'];
    return new Response(body, { status });
  };
  fn.calls = calls;
  return fn;
}

const run = async (args, { env = {}, fetch = fakeFetch() } = {}) => {
  const stdout = sink();
  const stderr = sink();
  const code = await main(args, { stdout, stderr, env, isTTY: false, fetch });
  return { code, out: stdout.text, err: stderr.text, fetch };
};

test('doctor --android --ios: one GET per file at the link host, all ok, exit 0', async () => {
  const r = await run(['doctor', '--host', HOST, '--key', KEY, '--android', 'com.acme.shop', '--ios', 'com.acme.shop']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.fetch.calls.map((c) => c.url).sort(), [
    `https://${HOST}/.well-known/apple-app-site-association`,
    `https://${HOST}/.well-known/assetlinks.json`,
  ]);
  assert.match(r.out, /ok\s+key\.ok\s+Publishable key is set/);
  assert.match(r.out, /Android[^\n]*\n[^\n]*ok\s+app\.listed\s+acme\.strait\.link lists com\.acme\.shop/);
  assert.match(r.out, /iPhone[^\n]*\n[^\n]*ok\s+app\.listed\s+acme\.strait\.link lists TEAM123\.com\.acme\.shop/);
  assert.equal(r.out.match(/key\.ok/g).length, 1, 'the key is checked once, not per platform');
  assert.match(r.out, /All checks passed/);
});

test('doctor: an app not listed is an error with the fix, exit 1', async () => {
  const r = await run(['doctor', '--host', HOST, '--android', 'com.other.app']);
  assert.equal(r.code, 1);
  assert.match(r.out, /error\s+app\.missing\s+acme\.strait\.link doesn't list com\.other\.app/);
  assert.match(r.out, /Fix: Add com\.other\.app in Dashboard → Apps & stores \(listed now: com\.acme\.shop\)\./);
  assert.doesNotMatch(r.out, /key\./, 'no --key: the key check is skipped, not failed');
  assert.equal(r.fetch.calls.length, 1, 'only the Android file when only --android is given');
});

test('doctor --cert: the signing certificate is compared like the Android SDK does', async () => {
  const ok = await run(['doctor', '--host', HOST, '--android', 'com.acme.shop', '--cert', 'aabb']);
  assert.match(ok.out, /ok\s+cert\.listed/);
  const bad = await run(['doctor', '--host', HOST, '--android', 'com.acme.shop', '--cert', 'CC:DD']);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /error\s+cert\.missing\s+This build's signing certificate isn't listed for com\.acme\.shop/);
});

test('doctor with no app ids: both files, app.unknown warnings list what the host has', async () => {
  const r = await run(['doctor', '--host', `https://${HOST}/summer`]);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.fetch.calls.length, 2);
  assert.match(r.out, /warn\s+app\.unknown\s+acme\.strait\.link lists com\.acme\.shop/);
  assert.match(r.out, /warn\s+app\.unknown\s+acme\.strait\.link lists TEAM123\.com\.acme\.shop/);
});

test('doctor: unreachable host and missing file use the SDK wording', async () => {
  const r = await run(['doctor', '--host', HOST, '--ios', 'com.acme.shop', '--android', 'com.acme.shop'], {
    fetch: fakeFetch({ 'assetlinks.json': 'network', 'apple-app-site-association': [404, ''] }),
  });
  assert.equal(r.code, 1);
  assert.match(r.out, /error\s+host\.unreachable\s+Can't reach acme\.strait\.link/);
  assert.match(r.out, /error\s+host\.file_missing\s+acme\.strait\.link doesn't serve apple-app-site-association/);
});

test('doctor: a secret key is flagged and never printed', async () => {
  const secret = 'st_live_abcdef0123456789abcdef0123456789';
  const r = await run(['doctor', '--host', HOST, '--key', secret]);
  assert.equal(r.code, 1);
  assert.match(r.out, /error\s+key\.secret\s+This is a secret key, not the publishable key/);
  assert.ok(!r.out.includes(secret) && !r.err.includes(secret));
});

test('doctor: the publishable key and host come from the environment too', async () => {
  const r = await run(['doctor', '--android', 'com.acme.shop'], { env: { STRAIT_PUBLISHABLE_KEY: KEY, STRAIT_LINK_HOST: HOST } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /key\.ok/);
});

test('doctor --json: the reports as JSON for CI and agents', async () => {
  const r = await run(['doctor', '--host', HOST, '--key', KEY, '--android', 'com.acme.shop', '--json']);
  assert.equal(r.code, 0);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, true);
  assert.equal(j.host, HOST);
  assert.deepEqual(j.android.findings.map((f) => f.id), ['key.ok', 'app.listed']);
  assert.equal(j.ios, undefined);
});

test('doctor without a host is a usage error', async () => {
  const r = await run(['doctor']);
  assert.equal(r.code, 2);
  assert.match(r.err, /--host/);
});
