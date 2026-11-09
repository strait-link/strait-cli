// `strait app` and `strait app verify` (docs/adr/0003): the workspace's app setup and the engine's checks of it
// (GET /v1/app, GET /v1/app/verify, engine ADR 0108), printed for people, or as the engine's JSON for agents.
// The engine owns every rule and every fix's wording; this file only prints them.
import { ApiError } from './links.mjs';

// Engine text can carry user-controlled names (hosts, workspace text): one printed line stays one line, with no
// terminal control characters and no bidi overrides that could make it read as something else.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const clean = (line) => String(line).replace(UNSAFE, (c) => (c === '\n' || c === '\r' || c === '\t' ? ' ' : ''));
const lines = (out) => out.map(clean).join('\n');
/** JSON for agents: as is, with DEL, C1 and bidi characters escaped (JSON.stringify escapes only those below U+0020). */
export const toJson = (x) => JSON.stringify(x, null, 2).replace(/[\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const str = (x) => (typeof x === 'string' && x ? x : null);
const objs = (x) => (Array.isArray(x) ? x.filter((o) => o && typeof o === 'object') : []);
const day = (iso) => {
  const t = Date.parse(str(iso) ?? '');
  return Number.isFinite(t) ? `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '?';
};

/** `sub`: undefined (show the setup) or 'verify'; cli.mjs refuses anything else. @returns {Promise<{ text: string, code: number }>} */
export async function appCommand(sub, v, { call }) {
  if (sub === undefined) {
    const setup = await getJson(call, '/v1/app');
    return { text: v.json ? toJson(setup) : formatSetup(setup), code: 0 };
  }
  const answer = await getVerify(call);
  return { text: v.json ? toJson(answer) : formatVerify(answer), code: answer?.ok === true ? 0 : 1 };
}

/** A 200 that isn't JSON (a proxy page, a wrong --api-url) is an ApiError, not a crash. */
async function getJson(call, path) {
  const res = await call('GET', path);
  try {
    return await res.json();
  } catch {
    throw new ApiError(`GET ${path}: the answer is not JSON. Is --api-url (STRAIT_API_URL) a Strait engine?`);
  }
}

export const getVerify = (call) => getJson(call, '/v1/app/verify');

function formatSetup(s) {
  const a = s?.android;
  const i = s?.ios;
  const out = ['Strait app setup', ''];
  if (a) {
    out.push(`  Android   ${str(a.packageName) ?? '(no package name)'}${str(a.scheme) ? `  scheme ${a.scheme}` : ''}  ${a.appLinksReady ? 'App Links ready' : 'App Links NOT ready'}`);
    for (const fp of Array.isArray(a.sha256Fingerprints) ? a.sha256Fingerprints : []) out.push(`            SHA-256 ${fp}`);
  } else out.push('  Android   not set up');
  if (i) {
    const id = str(i.appId) ?? `${str(i.teamId) ?? '(no Team ID)'}.${str(i.bundleId) ?? '(no bundle ID)'}`;
    out.push(`  iPhone    ${id}${str(i.appStoreId) ? `  App Store ${i.appStoreId}` : ''}  ${i.universalLinksReady ? 'Universal Links ready' : 'Universal Links NOT ready'}`);
  } else out.push('  iPhone    not set up');

  const domains = objs(s?.domains);
  out.push('', `Link domains (files checked ${day(s?.filesCheckedAt)})`);
  if (!domains.length) out.push('  none');
  const PHONE = { android: 'Android', ios: 'iPhone' };
  for (const d of domains) {
    const files = objs(d.files).map((f) => `${PHONE[f.platform] ?? f.platform} file ${f.served === true ? 'served' : f.served === false ? 'NOT served' : 'not checked yet'}`);
    out.push(`  ${d.host} (${d.kind})  ${files.join(' · ') || 'no app file (no app set up)'}`);
  }

  out.push('', `SDK seen (last ${s?.sdkWindow?.days ?? 30} days)`);
  for (const [p, label] of [['android', 'Android'], ['ios', 'iPhone'], ['web', 'Web']]) {
    const x = s?.sdk?.[p];
    const what = !x ? 'not seen' : `${str(x.reported) ?? 'no SDK version sent'}, last app open ${day(x.lastSeenAt)}`;
    out.push(`  ${label.padEnd(8)}  ${what}`);
  }
  out.push('', `Change these in ${str(s?.setupUrl) ?? 'Dashboard › Setup'}. Check everything: strait app verify`);
  return lines(out);
}

/** One line per check; under anything not passed, what is wrong and the fix. */
export function verifyLines(answer) {
  const out = [];
  for (const c of objs(answer?.checks)) {
    out.push(`  ${String(c.status).padEnd(7)}  ${c.title}`);
    if (c.status === 'pass' || c.status === 'skip') continue;
    if (c.detail) out.push(`           ${c.detail}`);
    if (c.fix) out.push(`           Fix: ${c.fix}`);
  }
  return out;
}

/** The verdict line: failures first, then checks that could not run. */
export function verifyVerdict(answer) {
  const n = answer?.summary ?? {};
  if (n.fail) return `${n.fail} check${n.fail > 1 ? 's' : ''} failed. Fix them, then run strait app verify again.`;
  if (n.unknown) return `${n.unknown} check${n.unknown > 1 ? 's' : ''} could not run. Run strait app verify again in a minute.`;
  return answer?.ok === true ? (n.warn ? 'No failures. Check the warnings above.' : 'All checks passed.') : 'Not all checks passed.';
}

function formatVerify(answer) {
  const n = answer?.summary ?? {};
  const out = [`Strait app verify (checked ${day(answer?.checkedAt)})`, '', ...verifyLines(answer), ''];
  out.push(`${n.pass ?? 0} pass, ${n.warn ?? 0} warn, ${n.fail ?? 0} fail, ${n.unknown ?? 0} unknown, ${n.skip ?? 0} skip.`, verifyVerdict(answer));
  return lines(out);
}

/** `strait doctor`'s account block: the verify answer, or why it could not run (never a silent pass). */
export function formatAccount(answer) {
  const head = 'Account (strait app verify)';
  if (answer?.error) return lines([head, `  Could not check: ${answer.error}`]);
  return lines([head, ...verifyLines(answer), '', verifyVerdict(answer)]);
}
