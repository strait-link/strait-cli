// Truth rules (council §5.4) on everything the CLI prints or writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatPlan, planInit } from '../src/init.mjs';
import { FIXTURES, HOST, KEY } from './helpers.mjs';

const BANNED = /\bstraight\b|\bcheapest\b|cheaper than|\bbest\b|not fingerprinting|Strait Technologies|\buptime\b|\blatency\b/i;
const src = fileURLToPath(new URL('../src', import.meta.url));

test('generated files and printed steps follow the truth rules', () => {
  for (const name of ['rn-bare', 'expo-router', 'expo-js', 'flutter-app', 'android-kotlin']) {
    const plan = planInit({ dir: join(FIXTURES, name), key: KEY, host: HOST });
    const text = formatPlan(plan, { dryRun: true });
    assert.doesNotMatch(text, BANNED, name);
    // iPhone left beta 22 Oct 2026 (ops/IOS-STATUS-1022.md): never "beta"; install matching is always called opt-in.
    assert.doesNotMatch(text, /beta/i, `${name}: iPhone is not beta`);
    if (/iPhone install matching/.test(text)) assert.match(text, /iPhone install matching is opt-in/, name);
  }
});

test('source files follow the truth rules', () => {
  for (const f of readdirSync(src)) assert.doesNotMatch(readFileSync(join(src, f), 'utf8'), BANNED, f);
});
