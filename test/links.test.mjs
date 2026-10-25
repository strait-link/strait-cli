// `strait links create|list|qr` against the public API (https://strait.link), secret key from env or flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../src/cli.mjs';
import { CLI_VERSION } from '../src/version.mjs';
import { sink } from './helpers.mjs';

const SECRET = 'st_live_0123456789abcdef0123456789abcdef';
const LINK = { id: 'l1', slug: 'summer', shortUrl: 'https://acme.strait.link/summer', longUrl: 'https://acme.com/summer', isActive: true };

/** A fetch that answers like the API and records each request. */
function api(answer = () => new Response(JSON.stringify(LINK), { status: 201 })) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const c = { url: new URL(String(url)), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(c);
    return answer(c);
  };
  fn.calls = calls;
  return fn;
}

const run = async (args, { env = { STRAIT_SECRET_KEY: SECRET }, fetch = api(), cwd } = {}) => {
  const stdout = sink();
  const stderr = sink();
  const code = await main(args, { stdout, stderr, env, isTTY: false, fetch, cwd });
  return { code, out: stdout.text, err: stderr.text, fetch };
};
const noKey = (r) => assert.ok(!r.out.includes(SECRET) && !r.err.includes(SECRET), 'the secret key is never printed');

test('links create: POST /v1/links with the secret key as a Bearer token, prints the short link', async () => {
  const r = await run(['links', 'create', 'summer', 'https://acme.com/summer', '--title', 'Summer', '--campaign', 'sale', '--tag', 'a', '--tag', 'b']);
  assert.equal(r.code, 0, r.err);
  const [c] = r.fetch.calls;
  assert.equal(c.method, 'POST');
  assert.equal(c.url.href, 'https://strait.link/v1/links');
  assert.equal(c.headers.authorization, `Bearer ${SECRET}`);
  assert.deepEqual(c.body, { slug: 'summer', longUrl: 'https://acme.com/summer', title: 'Summer', campaign: 'sale', tags: ['a', 'b'] });
  assert.match(r.out, /https:\/\/acme\.strait\.link\/summer/);
  noKey(r);
});

test('links create --json prints the API answer; --api-url and STRAIT_API_URL pick the engine', async () => {
  const r = await run(['links', 'create', 'summer', 'https://acme.com/summer', '--json', '--api-url', 'https://dev.example.test/']);
  assert.deepEqual(JSON.parse(r.out), LINK);
  assert.equal(r.fetch.calls[0].url.origin, 'https://dev.example.test');
  const e = await run(['links', 'list'], { env: { STRAIT_SECRET_KEY: SECRET, STRAIT_API_URL: 'https://e.example.test' }, fetch: api(() => Response.json({ links: [], nextCursor: null })) });
  assert.equal(e.fetch.calls[0].url.origin, 'https://e.example.test');
});

test('links create needs a slug and a URL', async () => {
  const r = await run(['links', 'create', 'summer']);
  assert.equal(r.code, 2);
  assert.match(r.err, /strait links create <slug> <url>/);
  assert.equal(r.fetch.calls.length, 0);
});

test('links list: GET /v1/links with limit/status/cursor, one line per link, next-page hint', async () => {
  const fetch = api(() => Response.json({ links: [LINK, { ...LINK, slug: 'winter', shortUrl: 'https://acme.strait.link/winter', isActive: false }], nextCursor: 'c2' }));
  const r = await run(['links', 'list', '--limit', '2', '--status', 'active'], { fetch });
  assert.equal(r.code, 0, r.err);
  const u = r.fetch.calls[0].url;
  assert.equal(u.pathname, '/v1/links');
  assert.equal(u.searchParams.get('limit'), '2');
  assert.equal(u.searchParams.get('status'), 'active');
  assert.match(r.out, /https:\/\/acme\.strait\.link\/summer\s+https:\/\/acme\.com\/summer/);
  assert.match(r.out, /winter.*paused/);
  assert.match(r.out, /--cursor c2/);
});

test('links qr: GET /v1/links/{slug}/qr, writes <slug>.png, never overwrites without --force', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'strait-cli-qr-'));
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const fetch = api(() => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }));
  const r = await run(['links', 'qr', 'summer', '--size', '512'], { fetch, cwd: dir });
  assert.equal(r.code, 0, r.err);
  const c = r.fetch.calls[0];
  assert.equal(c.url.pathname, '/v1/links/summer/qr');
  assert.equal(c.url.searchParams.get('size'), '512');
  assert.equal(c.headers.accept, 'image/png');
  assert.deepEqual(new Uint8Array(readFileSync(join(dir, 'summer.png'))), png);
  assert.match(r.out, /summer\.png/);

  const again = await run(['links', 'qr', 'summer'], { fetch, cwd: dir });
  assert.equal(again.code, 2);
  assert.match(again.err, /already exists.*--force/);

  const svg = await run(['links', 'qr', 'summer', '--format', 'svg', '--out', 'q.svg'], { fetch: api(() => new Response('<svg/>', { status: 200 })), cwd: dir });
  assert.equal(svg.code, 0, svg.err);
  assert.equal(svg.fetch.calls[0].url.searchParams.get('format'), 'svg');
  assert.equal(svg.fetch.calls[0].headers.accept, 'image/svg+xml');
  assert.equal(readFileSync(join(dir, 'q.svg'), 'utf8'), '<svg/>');
});

test('the slug is URL-encoded in the path', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'strait-cli-qr-'));
  const r = await run(['links', 'qr', 'a/b', '--out', 'x.png'], { fetch: api(() => new Response('x')), cwd: dir });
  assert.equal(r.fetch.calls[0].url.pathname, '/v1/links/a%2Fb/qr');
});

test('no secret key: a usage error that says where to get one, no request sent', async () => {
  const r = await run(['links', 'list'], { env: {} });
  assert.equal(r.code, 2);
  assert.match(r.err, /STRAIT_SECRET_KEY/);
  assert.match(r.err, /Dashboard → Settings → Secret keys/);
  assert.equal(r.fetch.calls.length, 0);
});

test('a publishable key is refused for the link API, and not echoed', async () => {
  const pub = 'st_pub_live_0123456789abcdef';
  const r = await run(['links', 'list', '--secret-key', pub], { env: {} });
  assert.equal(r.code, 2);
  assert.match(r.err, /publishable key/);
  assert.ok(!r.err.includes(pub));
});

test('--secret-key works and is never echoed, even if the API error repeats it', async () => {
  const fetch = api(() => Response.json({ error: `bad key ${SECRET}` }, { status: 401 }));
  const r = await run(['links', 'list', '--secret-key', SECRET], { env: {}, fetch });
  assert.equal(r.code, 1);
  assert.match(r.err, /HTTP 401/);
  assert.match(r.err, /bad key st_live_…/);
  assert.equal(r.fetch.calls[0].headers.authorization, `Bearer ${SECRET}`);
  noKey(r);
});

test('API errors print the API message and exit 1; network errors too', async () => {
  const conflict = await run(['links', 'create', 'summer', 'https://acme.com'], { fetch: api(() => Response.json({ error: 'slug already taken' }, { status: 409 })) });
  assert.equal(conflict.code, 1);
  assert.match(conflict.err, /slug already taken \(HTTP 409\)/);
  const down = await run(['links', 'list'], { fetch: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(down.code, 1);
  assert.match(down.err, /Can't reach https:\/\/strait\.link/);
});

test('links with an unknown subcommand is a usage error', async () => {
  const r = await run(['links', 'delete', 'x']);
  assert.equal(r.code, 2);
  assert.match(r.err, /create, list or qr/);
});

test('help lists doctor and links', async () => {
  const r = await run(['--help']);
  assert.match(r.out, /strait doctor/);
  assert.match(r.out, /strait links create <slug> <url>/);
  assert.match(r.out, /STRAIT_SECRET_KEY/);
});

test('CLI_VERSION (the API User-Agent) equals package.json version', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(CLI_VERSION, pkg.version);
  const r = await run(['links', 'list'], { fetch: api(() => Response.json({ links: [], nextCursor: null })) });
  assert.equal(r.fetch.calls[0].headers['user-agent'], `strait-cli/${pkg.version}`);
  assert.match(r.out, /No links yet/);
});
