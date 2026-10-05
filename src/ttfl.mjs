// Time to first link: how long the scripted parts of the path take.
//   measureInit  – `strait init` on fresh copies of the fixture apps (offline).
//   measureLive  – create a link through the API, then tap it as Android Chrome
//                  would (no redirect follow) and read the verification file.
// The human parts (sign-up, rebuild, tapping on a phone) are timed by hand with the
// protocol in docs/TIME-TO-FIRST-LINK.md.
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planInit, writeFiles } from './init.mjs';

const ms = (t0) => Math.round((performance.now() - t0) * 10) / 10;

export function measureInit(fixturesDir, { key, host }) {
  const rows = [];
  for (const name of readdirSync(fixturesDir)) {
    const tmp = mkdtempSync(join(tmpdir(), `strait-ttfl-${name}-`));
    cpSync(join(fixturesDir, name), tmp, { recursive: true });
    const t0 = performance.now();
    try {
      const plan = planInit({ dir: tmp, key, host });
      const written = writeFiles(plan);
      rows.push({ fixture: name, framework: plan.project.framework, ms: ms(t0), files: written, steps: plan.steps.length });
    } catch (e) {
      rows.push({ fixture: name, framework: null, ms: ms(t0), error: e.message });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return rows;
}

export const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

/**
 * @param {{ api: string, secretKey: string, slug?: string, longUrl?: string, fetch?: typeof fetch }} o
 * @returns {Promise<Array<{ step, ms, ok, detail }>>}
 */
export async function measureLive({ api, secretKey, slug, longUrl = 'https://shop.example.com/product/42', fetch: f = fetch }) {
  if (!/^st_(live|test)_/.test(secretKey ?? '')) throw new Error('STRAIT_SECRET_KEY must be a secret key (st_live_…)');
  const base = `https://${api.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  const steps = [];
  const s = slug ?? `ttfl-${Date.now().toString(36)}`;

  let t0 = performance.now();
  const created = await f(`${base}/v1/links`, {
    method: 'POST',
    headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ slug: s, longUrl }),
  });
  const body = await created.json().catch(() => ({}));
  steps.push({ step: 'create link (POST /v1/links)', ms: ms(t0), ok: created.status === 201, detail: `${created.status} ${body.shortUrl ?? body.error ?? ''}`.trim() });
  if (created.status !== 201 || !body.shortUrl) return steps;

  t0 = performance.now();
  const tap = await f(body.shortUrl, { redirect: 'manual', headers: { 'user-agent': ANDROID_CHROME_UA } });
  const loc = tap.headers.get('location') ?? '';
  const where = loc ? loc.split(':')[0] + '://…' : `${tap.status} page`;
  steps.push({ step: 'tap as Android Chrome', ms: ms(t0), ok: (tap.status >= 300 && tap.status < 400 && Boolean(loc)) || tap.status === 200, detail: `${tap.status} → ${where}` });

  t0 = performance.now();
  const host = new URL(body.shortUrl).host;
  const al = await f(`https://${host}/.well-known/assetlinks.json`);
  steps.push({ step: 'assetlinks.json', ms: ms(t0), ok: al.status === 200, detail: al.status === 200 ? '200 (App Links can verify)' : `${al.status} (fill package + SHA-256 in Settings)` });
  return steps;
}

export function formatRows(rows, cols) {
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
  const line = (r) => cols.map((c, i) => String(r[c] ?? '').padEnd(widths[i])).join('  ');
  return [line(Object.fromEntries(cols.map((c) => [c, c]))), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}
