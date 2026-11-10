// `strait test`: key, engine, link domain and its well-known files in one pass/fail list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/cli.mjs';
import { sink } from './helpers.mjs';

const SECRET = 'st_live_0123456789abcdef0123456789abcdef';
const WORKSPACE = { name: 'Acme', handle: 'acme', linkBase: 'https://acme.strait.link', linkDomain: 'acme.strait.link', customDomains: [], plan: 'starter', key: { scope: 'full', prefix: 'st_live_0123' } };
const AASA = JSON.stringify({ applinks: { details: [{ appIDs: ['TEAM123.com.acme.shop'], components: [{ '/': '/*' }] }] } });
const ASSETLINKS = JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.acme.shop', sha256_cert_fingerprints: ['AA:BB'] } }]);

/** A fetch for the engine and the link domain; `over` replaces any route's answer (a function, or 'down'). */
function world(over = {}) {
  const routes = {
    '/healthz': () => Response.json({ ok: true, version: 'ddca50a' }),
    '/v1/workspace': () => Response.json(WORKSPACE),
    '/.well-known/apple-app-site-association': () => new Response(AASA),
    '/.well-known/assetlinks.json': () => new Response(ASSETLINKS),
    ...over,
  };
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: u, headers: init.headers ?? {} });
    const r = routes[u.pathname];
    if (!r || r === 'down') throw new TypeError('fetch failed');
    return r(u);
  };
  fn.calls = calls;
  return fn;
}

const run = async (args = [], { env = { STRAIT_SECRET_KEY: SECRET }, fetch = world() } = {}) => {
  const stdout = sink();
  const stderr = sink();
  const code = await main(['test', ...args], { stdout, stderr, env, isTTY: false, fetch });
  assert.ok(!stdout.text.includes(SECRET) && !stderr.text.includes(SECRET), 'the secret key is never printed');
  return { code, out: stdout.text, err: stderr.text, fetch };
};

test('all good: one pass line each for engine, key, workspace domain, iPhone and Android files; exit 0', async () => {
  const r = await run();
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /pass\s+Engine\s+.*strait\.link.*ddca50a/);
  assert.match(r.out, /pass\s+Key\s+.*live key.*Acme/);
  assert.match(r.out, /pass\s+Link domain\s+acme\.strait\.link/);
  assert.match(r.out, /pass\s+iPhone\s+.*TEAM123\.com\.acme\.shop/);
  assert.match(r.out, /pass\s+Android\s+.*com\.acme\.shop/);
  assert.match(r.out, /All checks passed/);
  const ws = r.fetch.calls.find((c) => c.url.pathname === '/v1/workspace');
  assert.equal(ws.url.origin, 'https://strait.link');
  assert.equal(ws.headers.authorization, `Bearer ${SECRET}`);
  // The well-known files are read from the workspace's link domain, not the API host.
  assert.ok(r.fetch.calls.filter((c) => c.url.pathname.startsWith('/.well-known/')).every((c) => c.url.host === 'acme.strait.link'));
});

test('a test key is reported as a test key', async () => {
  const key = 'st_test_0123456789abcdef0123456789abcdef';
  const r = await run([], { env: { STRAIT_SECRET_KEY: key } });
  assert.equal(r.code, 0);
  assert.match(r.out, /pass\s+Key\s+.*test key/);
});

test('a key the engine refuses: Key fails with the fix, domain checks are skipped, exit 1', async () => {
  const r = await run([], { fetch: world({ '/v1/workspace': () => Response.json({ error: 'invalid API key' }, { status: 401 }) }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /fail\s+Key\s+.*invalid API key/);
  assert.match(r.out, /Fix: .*Dashboard → Settings → Keys/);
  assert.match(r.out, /skip\s+Link domain/);
  assert.ok(!r.fetch.calls.some((c) => c.url.pathname.startsWith('/.well-known/')));
});

test('engine unreachable: Engine fails, the rest is skipped, exit 1', async () => {
  const r = await run([], { fetch: world({ '/healthz': 'down', '/v1/workspace': 'down' }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /fail\s+Engine\s+.*Can't reach https:\/\/strait\.link/);
  assert.match(r.out, /skip\s+Key/);
  assert.equal(r.fetch.calls.length, 1);
});

test('the link domain serves no AASA: iPhone fails with the doctor fix, Android still passes, exit 1', async () => {
  const r = await run([], { fetch: world({ '/.well-known/apple-app-site-association': () => new Response('nope', { status: 404 }) }) });
  assert.equal(r.code, 1);
  assert.match(r.out, /fail\s+iPhone\s+.*doesn't serve apple-app-site-association/);
  assert.match(r.out, /pass\s+Android/);
  assert.match(r.out, /1 check failed/);
});

test('--json prints { ok, checks } for CI; --api-url picks the engine', async () => {
  const r = await run(['--json', '--api-url', 'https://dev.example.test']);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, true);
  assert.deepEqual(j.checks.map((c) => [c.id, c.status]), [['engine', 'pass'], ['key', 'pass'], ['domain', 'pass'], ['ios', 'pass'], ['android', 'pass']]);
  assert.equal(j.workspace.linkDomain, 'acme.strait.link');
  assert.equal(j.workspace.mode, 'live');
  assert.equal(r.fetch.calls[0].url.origin, 'https://dev.example.test');
});

test('no key, or a publishable key: usage error (exit 2) that says where to get the secret key, nothing sent', async () => {
  const none = await run([], { env: {} });
  assert.equal(none.code, 2);
  assert.match(none.err, /Dashboard → Settings → Keys/);
  const pub = await run([], { env: { STRAIT_SECRET_KEY: 'st_pub_live_0123456789abcdef' } });
  assert.equal(pub.code, 2);
  assert.match(pub.err, /publishable key/);
  assert.equal(none.fetch.calls.length + pub.fetch.calls.length, 0);
});

test('an answer that is not a Strait engine, or a workspace without a link domain, is a fail line, not a crash', async () => {
  const html = await run([], { fetch: world({ '/healthz': () => new Response('<html>wifi login</html>') }) });
  assert.equal(html.code, 1);
  assert.match(html.out, /fail\s+Engine\s+.*not like a Strait engine/);
  const odd = await run([], { fetch: world({ '/v1/workspace': () => new Response('<html>') }) });
  assert.equal(odd.code, 1);
  assert.match(odd.out, /fail\s+Key\s+.*no link domain/);
});

test('terminal control characters in a workspace name are not printed', async () => {
  const r = await run([], { fetch: world({ '/v1/workspace': () => Response.json({ ...WORKSPACE, name: 'Acme\u001b[2J\u001b]0;pwned\u0007' }) }) });
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.out, /[\u001b\u0007]/);
});

test('odd workspace fields: no crash, a bad link domain is a fail line, the key prefix never grows past 12', async () => {
  const odd = await run([], { fetch: world({ '/v1/workspace': () => Response.json({ ...WORKSPACE, customDomains: 'a.strait.link', name: { x: 1 } }) }) });
  assert.equal(odd.code, 0, odd.out + odd.err);
  const bad = await run([], { fetch: world({ '/v1/workspace': () => Response.json({ ...WORKSPACE, linkDomain: 'https://a.strait.link/x' }) }) });
  assert.equal(bad.code, 0, 'normalised to a.strait.link');
  const worse = await run([], { fetch: world({ '/v1/workspace': () => Response.json({ ...WORKSPACE, linkDomain: 'not a host' }) }) });
  assert.equal(worse.code, 1);
  assert.match(worse.out, /fail\s+Link domain/);
  assert.ok(!worse.fetch.calls.some((c) => c.url.pathname.startsWith('/.well-known/')));
  const long = await run(['--json'], { fetch: world({ '/v1/workspace': () => Response.json({ ...WORKSPACE, key: { scope: 'full', prefix: SECRET } }) }) });
  assert.equal(JSON.parse(long.out).workspace.keyPrefix.length <= 12, true);
});

test('strait test takes no arguments', async () => {
  const r = await run(['extra']);
  assert.equal(r.code, 2);
});
