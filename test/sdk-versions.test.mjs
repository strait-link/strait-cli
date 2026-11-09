// The drift guard (docs/adr/0002-sdk-version-drift-guard.md): its pure parts, offline.
// The live registry check itself runs in CI (`npm run check:sdk-versions`), not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drift, highest, tagsFromLsRemote } from '../scripts/check-sdk-versions.mjs';
import { VERSIONS } from '../src/install.mjs';

test('highest stable semver wins, numerically, prereleases ignored', () => {
  assert.equal(highest(['0.9.9', '0.10.4', '0.10.10', '0.11.0-beta.1', '0.2.0']), '0.10.10');
  assert.equal(highest([]), null);
});

test('git tags come from ls-remote output, peeled refs and non-semver tags skipped', () => {
  const out = 'a1\trefs/tags/v0.11.3\nb2\trefs/tags/v0.11.4\nb3\trefs/tags/v0.11.4^{}\nc4\trefs/tags/latest\nd5\trefs/tags/v1.0.0-rc.1\n';
  assert.deepEqual(tagsFromLsRemote(out), ['0.11.3', '0.11.4']);
});

test('drift lists every pin that is not the latest, older or unpublished', () => {
  const latest = { ...VERSIONS };
  assert.deepEqual(drift(VERSIONS, latest), []);
  const rows = drift({ ...VERSIONS, rnVersion: '0.1.0', androidVersion: '9.9.9' }, latest);
  assert.deepEqual(rows.map((r) => r.key).sort(), ['androidVersion', 'rnVersion']);
  assert.deepEqual(drift(VERSIONS, { ...latest, flutterVersion: null }).map((r) => r.key), ['flutterVersion'], 'an unknown latest is drift, never a pass');
});
