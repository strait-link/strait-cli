import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));
export const KEY = 'st_pub_live_0123456789abcdef';
export const HOST = 'acme.strait.link';

/** A fresh, writable copy of a fixture app. */
export function copyFixture(name) {
  const dir = mkdtempSync(join(tmpdir(), `strait-cli-${name}-`));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

/** Captures what main() writes. */
export function sink() {
  let text = '';
  return { write: (s) => { text += s; return true; }, get text() { return text; } };
}
