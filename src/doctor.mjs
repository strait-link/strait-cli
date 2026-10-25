// `strait doctor`: the SDK setup check (contract B23, shared-spec docs/adr/0002-sdk-doctor.md) from a
// terminal. `doctorFindings` is a line-for-line port of strait-sdk-react-native 0.9.3 src/doctor.ts:
// same finding ids, severities and wording as every SDK (test/doctor-vectors.json, 43 shared cases).

/** The endpoint's host when it is an `https://` URL with a host, else null. */
export function doctorHost(endpoint) {
  const m = /^https:\/\/([^/?#\s@]+)(?:[/?#]|$)/i.exec(String(endpoint ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

/** Upper-case, colon-separated, as assetlinks.json writes it. */
const normFp = (s) => (s.replace(/[^0-9a-f]/gi, '').toUpperCase().match(/../g) ?? []).join(':');

const ok = (id, title) => ({ id, severity: 'ok', title, fix: '' });
const err = (id, title, fix) => ({ id, severity: 'error', title, fix });

/** Android: package → fingerprints; iOS: full appIDs (value unused). Null = not the JSON expected. */
function listedApps(platform, body) {
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const apps = new Map();
  if (platform === 'android') {
    if (!Array.isArray(json)) return null;
    for (const s of json) {
      const t = s?.target;
      if (t?.namespace !== 'android_app' || typeof t.package_name !== 'string') continue;
      const fps = Array.isArray(t.sha256_cert_fingerprints) ? t.sha256_cert_fingerprints.filter((f) => typeof f === 'string') : [];
      apps.set(t.package_name, [...(apps.get(t.package_name) ?? []), ...fps.map(normFp)]);
    }
    return apps;
  }
  const details = json?.applinks?.details;
  if (!Array.isArray(details)) return null;
  for (const d of details) {
    for (const id of [...(Array.isArray(d?.appIDs) ? d.appIDs : []), d?.appID]) if (typeof id === 'string') apps.set(id, []);
  }
  return apps;
}

/**
 * @param {{ publishableKey: string, endpoint: string, platform: 'android'|'ios', appId?: string,
 *   certSha256?: string[], file?: { status?: number, body?: string } }} input
 * @returns {{ ok: boolean, findings: { id: string, severity: 'ok'|'warn'|'error', title: string, fix: string }[] }}
 */
export function doctorFindings(input) {
  const findings = [];
  const key = input.publishableKey ?? '';
  if (key.startsWith('st_pub_')) findings.push(ok('key.ok', 'Publishable key is set'));
  else if (key.startsWith('st_live_') || key.startsWith('st_test_'))
    findings.push(err('key.secret', 'This is a secret key, not the publishable key', 'Use the publishable key (st_pub_…) from Dashboard → Get started, and revoke this secret key in Dashboard → Settings → Secret keys: it has been inside your app.'));
  else findings.push(err('key.invalid', 'Not a publishable key', 'Copy the publishable key (st_pub_…) from Dashboard → Get started.'));

  const host = doctorHost(input.endpoint ?? '');
  if (!host) {
    findings.push(err('endpoint.invalid', "The endpoint isn't an https link domain", 'Set endpoint to your link domain from Dashboard → Get started, e.g. https://<handle>.strait.link.'));
  } else if (input.file) findings.push(...hostFindings(input, host, input.file));
  return { ok: !findings.some((f) => f.severity === 'error'), findings };
}

function hostFindings(input, host, file) {
  const android = input.platform === 'android';
  if (file.status === undefined)
    return [err('host.unreachable', `Can't reach ${host}`, 'Check that endpoint is your link domain (Dashboard → Get started) and that this device is online.')];
  const apps = file.status === 200 ? listedApps(input.platform, file.body ?? '') : null;
  if (!apps)
    return [err('host.file_missing', `${host} doesn't serve ${android ? 'assetlinks.json' : 'apple-app-site-association'}`, 'Use your Strait link domain as endpoint (Dashboard → Get started); Strait serves this file there.')];
  if (!apps.size) return [err('app.none', `No ${android ? 'Android' : 'iOS'} app is set up for ${host}`, 'Add your app in Dashboard → Apps & stores.')];

  const listed = [...apps.keys()].join(', ');
  const app = input.appId?.trim();
  if (!app) return [{ id: 'app.unknown', severity: 'warn', title: `${host} lists ${listed}`, fix: 'Make sure your app is one of these.' }];
  const match = android ? (apps.has(app) ? app : undefined) : [...apps.keys()].find((id) => id.endsWith(`.${app}`));
  if (!match) return [err('app.missing', `${host} doesn't list ${app}`, `Add ${app} in Dashboard → Apps & stores (listed now: ${listed}).`)];

  const out = [ok('app.listed', `${host} lists ${match}`)];
  const certs = android ? (input.certSha256 ?? []).map(normFp).filter(Boolean) : [];
  if (certs.length) {
    const fps = apps.get(match);
    out.push(
      certs.some((c) => fps.includes(c))
        ? ok('cert.listed', "This build's signing certificate is listed")
        : err('cert.missing', `This build's signing certificate isn't listed for ${app}`, `Add ${certs.join(', ')} in Dashboard → Apps & stores. Debug, release and Play App Signing keys each have their own fingerprint.`),
    );
  }
  return out;
}

const FILES = { android: 'assetlinks.json', ios: 'apple-app-site-association' };

/** One GET of the platform's well-known file, like the SDKs do. No status = the GET failed. */
async function fetchFile(fetchImpl, host, platform) {
  try {
    const res = await fetchImpl(`https://${host}/.well-known/${FILES[platform]}`, { method: 'GET', signal: AbortSignal.timeout(10_000) });
    return { status: res.status, body: await res.text() };
  } catch {
    return {};
  }
}

/**
 * Runs the doctor for each platform asked (both when neither app id is given). With no publishable
 * key the key check is left out rather than failed: the CLI checks the host, the key lives in the app.
 * @returns {Promise<{ ok: boolean, host: string, android?: object, ios?: object }>}
 */
export async function runDoctor({ host, key, android, ios, certs = [], fetch: fetchImpl = fetch }) {
  const platforms = android || ios ? [android && 'android', ios && 'ios'].filter(Boolean) : ['android', 'ios'];
  const result = { ok: true, host };
  await Promise.all(
    platforms.map(async (platform) => {
      const file = await fetchFile(fetchImpl, host, platform);
      const report = doctorFindings({
        publishableKey: key ?? 'st_pub_',
        endpoint: `https://${host}`,
        platform,
        appId: platform === 'android' ? android : ios,
        certSha256: platform === 'android' ? certs : [],
        file,
      });
      if (!key) report.findings = report.findings.filter((f) => !f.id.startsWith('key.'));
      report.ok = !report.findings.some((f) => f.severity === 'error');
      result[platform] = report;
      if (!report.ok) result.ok = false;
    }),
  );
  return result;
}

const LABEL = { android: 'Android (assetlinks.json)', ios: 'iPhone (apple-app-site-association)' };

/** Plain text: the key line once, then each platform's checks with their fixes. */
export function formatDoctor(result) {
  const line = (f) => `  ${f.severity.padEnd(5)}  ${f.id.padEnd(17)} ${f.title}${f.fix ? `\n${' '.repeat(27)}Fix: ${f.fix}` : ''}`;
  const reports = ['android', 'ios'].filter((p) => result[p]);
  const keyLines = result[reports[0]].findings.filter((f) => f.id.startsWith('key.'));
  const out = [`Strait doctor for ${result.host}`];
  if (keyLines.length) out.push('', 'Key', ...keyLines.map(line));
  for (const p of reports) out.push('', LABEL[p], ...result[p].findings.filter((f) => !f.id.startsWith('key.')).map(line));
  const warned = reports.some((p) => result[p].findings.some((f) => f.severity === 'warn'));
  out.push('', !result.ok ? 'Fix the errors above, then run strait doctor again.' : warned ? 'No errors. Check the warnings above.' : 'All checks passed.');
  out.push("Intent filters and the Associated Domains entitlement aren't visible from here: call doctor() in a debug build, or see https://straitlink.in/tools/.");
  return out.join('\n');
}
