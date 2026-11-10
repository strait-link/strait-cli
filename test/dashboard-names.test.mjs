// Help, errors, doctor fixes and the README name dashboard screens that exist (QA 10 Nov, F5): the publishable key
// and link domain are in Dashboard → Setup → Your keys (app.straitlink.in/setup#keys), secret keys in
// Dashboard → Settings → Keys (app.straitlink.in/settings#keys). "Get started" and "Secret keys" were the old names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OLD = /(?:→|›|->| >)\s*\*{0,2}(?:Get started|Secret keys)\b|\bGet started\*{0,2}\s*(?:→|›|->)|\b(?:from|on|in) \*{0,2}Get started\b(?! free)/;
const files = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((n) => files(join(p, n))) : [p]);

test('the pattern catches the old names and leaves the real ones alone', () => {
  for (const s of ['Find it in Dashboard → Get started.', 'Dashboard → Settings → Secret keys', 'Dashboard > Settings > Secret keys']) assert.match(s, OLD);
  for (const s of ['Dashboard → Setup → Your keys', 'Dashboard → Settings → Keys', 'Get started free']) assert.doesNotMatch(s, OLD);
});

test('nothing the CLI prints or documents sends people to "Get started" or "Secret keys"', () => {
  const bad = ['bin', 'src', 'scripts', 'docs', 'test/doctor-vectors.json', 'README.md', 'SECURITY.md']
    .flatMap(files)
    .flatMap((f) => readFileSync(f, 'utf8').split('\n').flatMap((l, i) => (OLD.test(l) ? [`${f}:${i + 1}`] : [])));
  assert.deepEqual(bad, []);
});
