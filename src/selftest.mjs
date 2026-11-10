// `strait test`: one pass for "am I set up right?" (ADR 0001). The engine answers (GET /healthz),
// the secret key is valid and says which workspace (GET /v1/workspace), and the workspace's link
// domain serves apple-app-site-association and assetlinks.json (the same doctor as `strait doctor`).
// Every failure is a `fail` line, never a throw; later checks that depend on it are `skip`.
import { ApiError, redact } from './links.mjs';
import { normalizeHost } from './validate.mjs';
import { runDoctor } from './doctor.mjs';

const pass = (id, label, title) => ({ id, label, status: 'pass', title, fix: '' });
const fail = (id, label, title, fix = '') => ({ id, label, status: 'fail', title, fix });
const skip = (id, label, why) => ({ id, label, status: 'skip', title: why, fix: '' });

const DOMAIN_CHECKS = [['domain', 'Link domain'], ['ios', 'iPhone'], ['android', 'Android']];

/**
 * @param {{ call: Function, apiUrl: string, key: string, fetch: typeof fetch }} opts
 * @returns {Promise<{ ok: boolean, workspace?: object, checks: object[] }>}
 */
export async function runSelfTest({ call, apiUrl, key, fetch: fetchImpl }) {
  const checks = [];
  let workspace;
  const done = () => ({ ok: !checks.some((c) => c.status === 'fail'), ...(workspace ? { workspace } : {}), checks });

  try {
    const h = await (await call('GET', '/healthz')).json().catch(() => ({}));
    if (h?.ok !== true) throw new ApiError(`${apiUrl} answered, but not like a Strait engine`);
    checks.push(pass('engine', 'Engine', `${apiUrl} answers${h.version ? ` (version ${h.version})` : ''}`));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    checks.push(fail('engine', 'Engine', e.message, 'Check your connection and --api-url, or https://straitlink.in/platform-status/.'));
    checks.push(skip('key', 'Key', 'needs the engine'), ...DOMAIN_CHECKS.map(([id, l]) => skip(id, l, 'needs the engine')));
    return done();
  }

  const mode = key.startsWith('st_test_') ? 'test' : 'live';
  try {
    const w = await (await call('GET', '/v1/workspace')).json().catch(() => null);
    if (typeof w?.linkDomain !== 'string' || !w.linkDomain) throw new ApiError("GET /v1/workspace: the engine's answer has no link domain");
    // Only strings are shown; the prefix is cut to the 12 characters the engine sends, in case a server echoes more.
    const str = (x) => (typeof x === 'string' ? x : null);
    const prefix = str(w.key?.prefix) && redact(w.key.prefix, key).slice(0, 12);
    workspace = {
      name: str(w.name), handle: str(w.handle), linkDomain: w.linkDomain,
      customDomains: Array.isArray(w.customDomains) ? w.customDomains.filter((d) => typeof d === 'string') : [],
      plan: str(w.plan), mode, keyPrefix: prefix || null, keyScope: str(w.key?.scope),
    };
    const access = workspace.keyScope && workspace.keyScope !== 'full' ? `, ${workspace.keyScope} access` : '';
    checks.push(pass('key', 'Key', `valid ${mode} key${prefix ? ` ${prefix}…` : ''} for workspace "${workspace.name ?? '?'}"${access}`));
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    checks.push(fail('key', 'Key', e.message, 'Create a secret key in Dashboard → Settings → Keys (https://app.straitlink.in/settings#keys) and set STRAIT_SECRET_KEY.'));
    checks.push(...DOMAIN_CHECKS.map(([id, l]) => skip(id, l, 'needs a valid key')));
    return done();
  }

  let host;
  try {
    host = normalizeHost(workspace.linkDomain);
  } catch {
    checks.push(fail('domain', 'Link domain', `"${workspace.linkDomain}" is not a host name`, 'Contact support@straitlink.in: the engine sent a bad link domain.'));
    checks.push(skip('ios', 'iPhone', 'needs a link domain'), skip('android', 'Android', 'needs a link domain'));
    return done();
  }
  const others = workspace.customDomains.filter((d) => d !== host);
  checks.push(pass('domain', 'Link domain', `${host}${workspace.plan ? ` (plan ${workspace.plan})` : ''}${others.length ? `; also ${others.join(', ')}` : ''}`));
  const doc = await runDoctor({ host, fetch: fetchImpl });
  for (const [id, label] of [['ios', 'iPhone'], ['android', 'Android']]) {
    const f = doc[id].findings.find((x) => x.severity === 'error') ?? doc[id].findings[0];
    checks.push(f.severity === 'error' ? fail(id, label, f.title, f.fix) : pass(id, label, f.title));
  }
  return done();
}

/** The readable list: one line per check, its fix under a failure, then the verdict. */
export function formatSelfTest(result) {
  const lines = ['Strait test', ''];
  for (const c of result.checks) {
    lines.push(`  ${c.status}  ${c.label.padEnd(12)} ${c.title}`);
    if (c.fix) lines.push(`${' '.repeat(21)}Fix: ${c.fix}`);
  }
  const failed = result.checks.filter((c) => c.status === 'fail').length;
  lines.push('', failed ? `${failed} check${failed > 1 ? 's' : ''} failed.` : 'All checks passed.');
  if (!failed) lines.push('Your app\'s own setup (intent filters, Associated Domains): strait doctor --android <package> --ios <bundleId>.');
  // Workspace names and served files are other people's text: no terminal control characters.
  return lines.join('\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/g, '');
}
