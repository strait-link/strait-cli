import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UsageError, normalizeHost, normalizeKey, normalizeScheme, suggestScheme } from '../src/validate.mjs';

test('publishable keys pass; secret keys are refused with a rotate hint', () => {
  assert.equal(normalizeKey('  st_pub_live_0123456789abcdef '), 'st_pub_live_0123456789abcdef');
  assert.equal(normalizeKey('st_pub_test_abcdefgh12'), 'st_pub_test_abcdefgh12');
  assert.throws(() => normalizeKey('st_live_0123456789abcdef'), (e) => e instanceof UsageError && /secret key/.test(e.message) && /rotate/.test(e.message));
  assert.throws(() => normalizeKey('bk_live_123'), UsageError);
  assert.throws(() => normalizeKey(''), /required/);
  assert.throws(() => normalizeKey('st_pub_live_short'), UsageError);
});

test('the docs example key and a cut-off key get plain messages, never a contradiction', () => {
  // The docs write the key as st_pub_live_… (quick-start run, 23 Oct 2026).
  for (const example of ['st_pub_live_…', 'st_pub_live_...', 'st_pub_live_', 'st_pub_test_…', 'st_pub_live_<your-key>', 'st_pub_live_YOUR_KEY']) {
    assert.throws(
      () => normalizeKey(example),
      (e) => e instanceof UsageError && /is the example key from the docs, not your key/.test(e.message) && /Dashboard → Get started/.test(e.message) && /Publishable key/.test(e.message),
      example,
    );
  }
  for (const cut of ['st_pub_live_short', 'st_pub_live_3f9a', 'st_pub_live_3f9a…']) {
    assert.throws(() => normalizeKey(cut), (e) => e instanceof UsageError && /looks cut off/.test(e.message) && /Dashboard → Get started/.test(e.message), cut);
  }
  for (const k of ['st_pub_live_…', 'st_pub_live_short']) {
    assert.throws(() => normalizeKey(k), (e) => !/It starts with st_pub_live_/.test(e.message), k);
  }
  assert.throws(() => normalizeKey('bk_live_123'), (e) => /is not a publishable key/.test(e.message) && /Dashboard → Get started/.test(e.message));
});

test('hosts are cleaned from a pasted link', () => {
  assert.equal(normalizeHost('https://Acme.Strait.link/summer?x=1'), 'acme.strait.link');
  assert.equal(normalizeHost('acme.strait.link.'), 'acme.strait.link');
  assert.equal(normalizeHost('links.acme.co.in'), 'links.acme.co.in');
  for (const bad of ['', 'localhost', 'acme', 'acme..link', '-a.strait.link', 'a_b.strait.link', 'acme.strait.123']) assert.throws(() => normalizeHost(bad), UsageError, bad);
});

test('schemes: lowercase word, never http(s) or intent', () => {
  assert.equal(normalizeScheme('AcmeShop://'), 'acmeshop');
  assert.equal(normalizeScheme('acme-shop'), 'acme-shop');
  for (const bad of ['', 'https', 'http', 'intent', 'javascript', '1abc', 'a', 'a b']) assert.throws(() => normalizeScheme(bad), UsageError, bad);
});

test('scheme guesses', () => {
  assert.equal(suggestScheme({ scheme: 'given' }), 'given');
  assert.equal(suggestScheme({ androidPackage: 'com.acme.shop' }), 'acmeshop');
  assert.equal(suggestScheme({ androidPackage: 'in.acme.pay' }), 'acmepay');
  assert.equal(suggestScheme({ appName: 'Acme Shop!' }), 'acmeshop');
  assert.equal(suggestScheme({ appName: 'App' }), null);
  assert.equal(suggestScheme({}), null);
});
