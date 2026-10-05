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
