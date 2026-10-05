#!/usr/bin/env node
// Time to first link (scripted parts). See docs/TIME-TO-FIRST-LINK.md.
//
//   node scripts/time-to-first-link.mjs            # offline: strait init on every fixture app
//   STRAIT_SECRET_KEY=st_live_… STRAIT_API=strait.link \
//     node scripts/time-to-first-link.mjs --live   # also: create a link, tap it as Android Chrome
//
// --live creates one real link (slug ttfl-<time>) in the key's workspace. It never deletes
// anything. Run it only against a workspace you own.
import { fileURLToPath } from 'node:url';
import { formatRows, measureInit, measureLive } from '../src/ttfl.mjs';

const fixtures = fileURLToPath(new URL('../test/fixtures', import.meta.url));
const live = process.argv.includes('--live');

const init = measureInit(fixtures, { key: 'st_pub_live_0123456789abcdef', host: 'acme.strait.link' });
console.log('strait init on fresh fixture apps\n');
console.log(formatRows(init.map((r) => ({ ...r, result: r.error ? `error: ${r.error.slice(0, 60)}` : r.files.join(', ') })), ['fixture', 'framework', 'ms', 'steps', 'result']));
const recognised = init.filter((r) => !r.error);
console.log(`\n${recognised.length}/${init.length} fixtures set up; slowest ${Math.max(...recognised.map((r) => r.ms))} ms`);

if (live) {
  const secretKey = process.env.STRAIT_SECRET_KEY;
  const api = process.env.STRAIT_API ?? 'strait.link';
  if (!secretKey) {
    console.error('\n--live needs STRAIT_SECRET_KEY (Dashboard → Settings → Secret keys).');
    process.exit(2);
  }
  const steps = await measureLive({ api, secretKey });
  console.log('\nLive path\n');
  console.log(formatRows(steps.map((s) => ({ ...s, ok: s.ok ? 'yes' : 'NO' })), ['step', 'ms', 'ok', 'detail']));
  console.log(`\nTotal ${Math.round(steps.reduce((a, s) => a + s.ms, 0))} ms`);
  process.exit(steps.every((s) => s.ok || s.step === 'assetlinks.json') ? 0 : 1);
}
// The unknown fixture is meant to fail detection.
process.exit(recognised.length === init.length - 1 ? 0 : 1);
