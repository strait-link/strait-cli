// `strait links create|list|qr`: the public link API (https://straitlink.in/docs/api/) with a secret key.
// The key is read from --secret-key or STRAIT_SECRET_KEY (same name as @straitlink/mcp) and is never
// printed: anything we print goes through `redact` first.
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UsageError } from './validate.mjs';

export const DEFAULT_API_URL = 'https://strait.link';
const SECRET = /^st_(live|test)_[A-Za-z0-9]{8,}$/;

/** A runtime failure (API said no, network down): exit 1 with this message. */
export class ApiError extends Error {}

/** The secret key for the link API, or a UsageError that says where to get one. Never echoes the value. */
export function secretKey(value) {
  const k = String(value ?? '').trim().replace(/^['"]+|['"]+$/g, '').replace(/^Bearer\s+/i, '');
  const where = 'Create one in Dashboard → Settings → Secret keys and set STRAIT_SECRET_KEY (or pass --secret-key).';
  if (!k) throw new UsageError(`The link API needs a secret key (st_live_…). ${where}`);
  if (k.startsWith('st_pub_')) throw new UsageError(`That is the publishable key (st_pub_…), which only works inside apps. The link API needs a secret key (st_live_…). ${where}`);
  if (!SECRET.test(k)) throw new UsageError(`That is not a secret key (st_live_… or st_test_…). ${where}`);
  return k;
}

/** Replaces every Strait secret key in text with its prefix. */
export const redact = (text, key) => {
  let s = String(text);
  if (key) s = s.split(key).join(`${key.slice(0, key.indexOf('_', 3) + 1)}…`);
  return s.replace(/\bst_(live|test)_[A-Za-z0-9]{8,}/g, 'st_$1_…');
};

export function apiClient({ apiUrl = DEFAULT_API_URL, key, fetch: fetchImpl = fetch, userAgent }) {
  const base = String(apiUrl).replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    throw new UsageError(`"${apiUrl}" is not a URL (--api-url / STRAIT_API_URL).`);
  }
  if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new UsageError('--api-url must be https (the secret key travels with every request).');
  }
  return async function call(method, path, { query = {}, body, accept = 'application/json' } = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    const headers = { accept, authorization: `Bearer ${key}` };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (userAgent) headers['user-agent'] = userAgent;
    let res;
    try {
      res = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new ApiError(`Can't reach ${base}. Check your connection, or https://straitlink.in/platform-status/.`);
    }
    if (!res.ok) {
      const text = await res.text();
      let msg = text.trim().slice(0, 300) || res.statusText;
      try {
        const j = JSON.parse(text);
        if (j && typeof j === 'object' && 'error' in j) msg = typeof j.error === 'string' ? j.error : JSON.stringify(j.error);
      } catch {
        // not JSON: keep the text
      }
      throw new ApiError(redact(`${method} ${path}: ${msg} (HTTP ${res.status})`, key).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ''));
    }
    return res;
  };
}

const enc = encodeURIComponent;

/** @returns {Promise<string>} what to print */
export async function linksCommand(sub, positionals, v, { call, cwd }) {
  if (sub === 'create') {
    const [slug, longUrl] = positionals;
    if (!slug || !longUrl) throw new UsageError('Usage: strait links create <slug> <url> [--title …] [--campaign …] [--tag …]');
    const body = { slug, longUrl };
    if (v.title) body.title = v.title;
    if (v.campaign) body.campaign = v.campaign;
    if (v.tag?.length) body.tags = v.tag;
    const link = await (await call('POST', '/v1/links', { body })).json();
    return v.json ? JSON.stringify(link, null, 2) : `Created ${link.shortUrl}\n  → ${link.longUrl}`;
  }
  if (sub === 'list') {
    const page = await (await call('GET', '/v1/links', { query: { limit: v.limit, cursor: v.cursor, status: v.status } })).json();
    if (v.json) return JSON.stringify(page, null, 2);
    const rows = (page.links ?? []).map((l) => `${l.shortUrl}  ${l.longUrl}${l.isActive === false ? '  (paused)' : ''}`);
    if (!rows.length) rows.push('No links yet. Create one: strait links create <slug> <url>');
    if (page.nextCursor) rows.push('', `More: strait links list --cursor ${page.nextCursor}`);
    return rows.join('\n');
  }
  if (sub === 'qr') {
    const [slug] = positionals;
    if (!slug) throw new UsageError('Usage: strait links qr <slug> [--format png|svg] [--size 512] [--out file]');
    const format = v.format ?? 'png';
    if (!['png', 'svg'].includes(format)) throw new UsageError('--format is png or svg.');
    const out = resolve(cwd, v.out ?? `${slug.replace(/[^A-Za-z0-9._-]/g, '_')}.${format}`);
    if (existsSync(out) && !v.force) throw new UsageError(`${out} already exists. Pass --force to replace it, or --out to pick another file.`);
    const res = await call('GET', `/v1/links/${enc(slug)}/qr`, { query: { format: v.format, size: v.size }, accept: format === 'svg' ? 'image/svg+xml' : 'image/png' });
    const bytes = new Uint8Array(await res.arrayBuffer());
    writeFileSync(out, bytes);
    return `Saved the QR code for ${slug} to ${out} (${bytes.byteLength} bytes).`;
  }
  throw new UsageError(`strait links takes create, list or qr${sub ? `, not "${sub}"` : ''}.`);
}
