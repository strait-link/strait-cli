import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureInit, measureLive, formatRows } from '../src/ttfl.mjs';
import { FIXTURES, HOST, KEY } from './helpers.mjs';

test('measureInit sets up every fixture app except the non-app', () => {
  const rows = measureInit(FIXTURES, { key: KEY, host: HOST });
  const ok = rows.filter((r) => !r.error).map((r) => r.framework).sort();
  assert.deepEqual(ok, ['android', 'expo', 'expo', 'flutter', 'react-native']);
  assert.match(rows.find((r) => r.fixture === 'unknown').error, /No React Native/);
  for (const r of rows) assert.equal(typeof r.ms, 'number');
});

test('measureLive: create, tap as Android Chrome without following, read assetlinks', async () => {
  const calls = [];
  const fake = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/v1/links')) return new Response(JSON.stringify({ shortUrl: 'https://acme.strait.link/ttfl-x' }), { status: 201 });
    if (url.endsWith('/ttfl-x')) return new Response(null, { status: 302, headers: { location: 'intent://shop.example.com/product/42#Intent;scheme=acmeshop;end' } });
    return new Response('[]', { status: 200 });
  };
  const steps = await measureLive({ api: 'https://strait.link/', secretKey: 'st_live_x', slug: 'ttfl-x', fetch: fake });
  assert.deepEqual(steps.map((s) => s.ok), [true, true, true]);
  assert.equal(calls[0].url, 'https://strait.link/v1/links');
  assert.equal(calls[0].init.headers.authorization, 'Bearer st_live_x');
  assert.deepEqual(JSON.parse(calls[0].init.body), { slug: 'ttfl-x', longUrl: 'https://shop.example.com/product/42' });
  assert.equal(calls[1].init.redirect, 'manual');
  assert.match(calls[1].init.headers['user-agent'], /Android/);
  assert.match(steps[1].detail, /302 → intent:\/\//);
  assert.equal(calls[2].url, 'https://acme.strait.link/.well-known/assetlinks.json');
});

test('measureLive stops after a failed create and refuses a publishable key', async () => {
  const fake = async () => new Response(JSON.stringify({ error: 'slug_taken' }), { status: 409 });
  const steps = await measureLive({ api: 'strait.link', secretKey: 'st_live_x', fetch: fake });
  assert.equal(steps.length, 1);
  assert.equal(steps[0].ok, false);
  await assert.rejects(measureLive({ api: 'strait.link', secretKey: 'st_pub_live_x', fetch: fake }), /secret key/);
});

test('formatRows aligns columns', () => {
  assert.equal(formatRows([{ a: 'x', b: 10 }], ['a', 'b']), 'a  b \n-  --\nx  10');
});
