// Argument parsing and prompting. `main(argv, io)` returns an exit code, so tests
// can drive it without spawning a process.
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { detectProject } from './detect.mjs';
import { formatPlan, planInit, writeFiles } from './init.mjs';
import { UsageError, normalizeHost, normalizeKey, normalizeScheme, suggestScheme } from './validate.mjs';
import { resolve } from 'node:path';
import { formatDoctor, runDoctor } from './doctor.mjs';
import { ApiError, DEFAULT_API_URL, apiClient, linksCommand, secretKey } from './links.mjs';
import { CLI_VERSION } from './version.mjs';
import { formatSelfTest, runSelfTest } from './selftest.mjs';
import { eventsCommand } from './events.mjs';
import { appCommand, formatAccount, getVerify, toJson } from './app.mjs';

const OPTIONS = {
  init: {
    key: { type: 'string' },
    host: { type: 'string' },
    scheme: { type: 'string' },
    framework: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    yes: { type: 'boolean', short: 'y', default: false },
  },
  doctor: {
    host: { type: 'string' },
    key: { type: 'string' },
    android: { type: 'string' },
    ios: { type: 'string' },
    cert: { type: 'string', multiple: true },
    'secret-key': { type: 'string' },
    'api-url': { type: 'string' },
    strict: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
  links: {
    'secret-key': { type: 'string' },
    'api-url': { type: 'string' },
    title: { type: 'string' },
    campaign: { type: 'string' },
    tag: { type: 'string', multiple: true },
    limit: { type: 'string' },
    status: { type: 'string' },
    cursor: { type: 'string' },
    format: { type: 'string' },
    size: { type: 'string' },
    out: { type: 'string' },
    force: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
  test: {
    'secret-key': { type: 'string' },
    'api-url': { type: 'string' },
    json: { type: 'boolean', default: false },
  },
  events: {
    platform: { type: 'string' },
  },
  app: {
    'secret-key': { type: 'string' },
    'api-url': { type: 'string' },
    json: { type: 'boolean', default: false },
  },
};

export const HELP = `strait: set up and check Strait deep links, and manage links

Usage
  strait init [dir] [options]                 Write the Strait integration into your app
  strait doctor [--host <host>] [options]     Check your link host (and with a secret key, your whole setup)
  strait links create <slug> <url> [options]  Create a link
  strait links list [options]                 List links
  strait links qr <slug> [options]            Save a link's QR code
  strait test [options]                       Check your key, the engine and your link domain
  strait app [options]                        Show your app setup as Strait sees it
  strait app verify [options]                 Check your whole setup: each problem with its fix
  strait events add <name> [dir] [options]    Print ready-to-paste code that tracks an event

init options
  --key <st_pub_live_…>   Publishable key (Dashboard → Get started)
  --host <host>           Your link domain, e.g. acme.strait.link
  --scheme <scheme>       Your app's custom scheme, the one in Dashboard → Apps & stores,
                          e.g. acmeshop (guessed from the package name if left out)
  --framework <name>      react-native | expo | flutter | android (detected by default)
  --dry-run               Print what would be written; write nothing
  --force                 Replace an existing integration file
  --yes, -y               Never prompt; fail if something is missing

doctor options (the same checks and messages as doctor() in the SDKs)
  --host <host>           Your link domain (env STRAIT_LINK_HOST)
  --android <package>     Android package, e.g. com.acme.shop
  --ios <bundleId>        iPhone bundle ID, e.g. com.acme.shop
  --cert <sha256>         Android signing certificate fingerprint (repeatable)
  --key <st_pub_live_…>   Also check the publishable key (env STRAIT_PUBLISHABLE_KEY)
  --secret-key <st_live_…>  Also run strait app verify (env STRAIT_SECRET_KEY); --host is then optional.
                          If it can't run (refused key, no connection), doctor says so
  --strict                Exit 1 when an account check fails or can't run (default: shown, exit unchanged)
  --api-url <url>         Engine for those checks (env STRAIT_API_URL, default https://strait.link)
  --json                  Print the reports as JSON
  With neither --android nor --ios, both files are checked and the apps they list are shown.
  Exit 1 when a check fails.

links options
  --secret-key <st_live_…>  Secret key (Dashboard → Settings → Secret keys). Prefer the
                            env STRAIT_SECRET_KEY: flags stay in your shell history
  --api-url <url>         API base (env STRAIT_API_URL, default https://strait.link)
  --title, --campaign, --tag <tag> (repeatable)   create: link details
  --limit <n>, --status active|paused, --cursor <c>  list: paging and filter
  --format png|svg, --size <px>, --out <file>, --force  qr: output (default <slug>.png)
  --json                  Print the API answer as JSON

test options
  --secret-key, --api-url   As for links (env STRAIT_SECRET_KEY, STRAIT_API_URL)
  --json                  Print { ok, workspace, checks } as JSON
  Checks the engine answers, the key is valid (which workspace, test or live), and the
  workspace's link domain serves apple-app-site-association and assetlinks.json. Exit 1
  when a check fails (so it can run in CI), 2 for a missing or wrong kind of key.

app options
  --secret-key, --api-url   As for links (env STRAIT_SECRET_KEY, STRAIT_API_URL); a read or full key
  --json                  Print the API answer as JSON (for agents and CI)
  strait app prints the apps, link domains and SDKs Strait has for your workspace. strait app verify
  runs the same checks as Dashboard › Setup › Integration health and prints each with its fix.
  Exit 1 when a check fails or could not run (or the API refuses the key), 2 for a missing or
  non-secret key.

events options
  --platform <name>       react-native | flutter | ios | android | web (detected by default)

Environment
  STRAIT_PUBLISHABLE_KEY, STRAIT_LINK_HOST, STRAIT_SECRET_KEY, STRAIT_API_URL

Examples
  npx @straitlink/cli init
  npx @straitlink/cli init --key st_pub_live_… --host acme.strait.link --dry-run
  npx @straitlink/cli doctor --host acme.strait.link --android com.acme.shop --ios com.acme.shop
  STRAIT_SECRET_KEY=st_live_… npx @straitlink/cli links create summer https://acme.com/summer
  STRAIT_SECRET_KEY=st_live_… npx @straitlink/cli test
  STRAIT_SECRET_KEY=st_live_… npx @straitlink/cli app verify
  npx @straitlink/cli events add purchase
`;

/**
 * @param {string[]} argv  arguments after the program name
 * @param {{ stdout, stderr, stdin, env, isTTY }} io
 */
export async function main(argv, io = {}) {
  const out = io.stdout ?? process.stdout;
  const err = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;
  const isTTY = io.isTTY ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const cmd = argv[0]?.startsWith('-') ? undefined : argv[0];
  if (!cmd || !(cmd in OPTIONS)) {
    const help = !cmd && argv.some((a) => a === '--help' || a === '-h');
    if (cmd) err.write(`Unknown command "${cmd}".\n\n${HELP}`);
    else out.write(HELP);
    return help ? 0 : 2;
  }
  let args;
  try {
    args = parseArgs({ args: argv.slice(1), allowPositionals: true, options: { ...OPTIONS[cmd], help: { type: 'boolean', short: 'h', default: false } } });
  } catch (e) {
    err.write(`${e.message}\n\n${HELP}`);
    return 2;
  }
  if (args.values.help) {
    out.write(HELP);
    return 0;
  }
  if (cmd !== 'init') {
    try {
      return await { doctor, links, test: selfTest, events, app }[cmd](args, { out, err, env, io });
    } catch (e) {
      if (e instanceof UsageError) {
        err.write(`strait: ${e.message}\n`);
        return 2;
      }
      if (e instanceof ApiError) {
        err.write(`strait: ${e.message}\n`);
        return 1;
      }
      throw e;
    }
  }
  const [dirArg] = args.positionals;

  const v = args.values;
  const dir = resolve(dirArg ?? '.');
  let key = v.key ?? env.STRAIT_PUBLISHABLE_KEY;
  let host = v.host ?? env.STRAIT_LINK_HOST;
  let scheme = v.scheme;

  try {
    const canAsk = isTTY && !v.yes;
    if (canAsk && (!key || !host || !scheme)) {
      const ask = io.ask ?? (await terminalAsker(io.stdin ?? process.stdin, out));
      try {
        key = key ?? (await askValid(ask, 'Publishable key (Dashboard → Get started, st_pub_live_…): ', normalizeKey, err));
        host = host ?? (await askValid(ask, 'Link host (e.g. acme.strait.link): ', normalizeHost, err));
        if (!scheme) {
          const guess = suggestScheme(detectProject(dir) ?? {});
          const hint = guess ? ` [${guess}, guessed from the package name]` : '';
          scheme = await askValid(ask, `Custom scheme (the one in Dashboard → Apps & stores)${hint}: `, (a) => normalizeScheme(a || guess || ''), err);
        }
      } finally {
        ask.close?.();
      }
    }
    const missing = [!key && '--key', !host && '--host'].filter(Boolean);
    if (missing.length) throw new UsageError(`Missing ${missing.join(' and ')}. Pass them as flags, or run in a terminal to be asked.`);

    const plan = planInit({ dir, key, host, scheme, framework: v.framework, force: v.force });
    if (v['dry-run']) {
      out.write(formatPlan(plan, { dryRun: true }) + '\n');
      if (plan.conflicts.length) out.write(`\nNote: ${plan.conflicts.join(', ')} already exists; a real run needs --force.\n`);
      return 0;
    }
    writeFiles(plan);
    out.write(formatPlan(plan) + '\n');
    return 0;
  } catch (e) {
    if (e instanceof UsageError) {
      err.write(`strait: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
}

async function askValid(ask, question, normalize, err) {
  for (let i = 0; i < 3; i++) {
    const a = (await ask.question(question)).trim();
    try {
      return normalize(a);
    } catch (e) {
      if (!(e instanceof UsageError)) throw e;
      err.write(`  ${e.message}\n`);
    }
  }
  throw new UsageError('Giving up after 3 tries.');
}

async function terminalAsker(input, output) {
  return createInterface({ input, output });
}

async function doctor({ values: v }, { out, env, io }) {
  const hostIn = v.host ?? env.STRAIT_LINK_HOST;
  const secretIn = v['secret-key'] ?? env.STRAIT_SECRET_KEY;
  if (!hostIn && !secretIn) throw new UsageError('Missing --host: your link domain from Dashboard → Get started, e.g. --host acme.strait.link. Or set STRAIT_SECRET_KEY to check your whole setup.');
  const fetchImpl = io.fetch ?? fetch;
  let result = { ok: true };
  if (hostIn) {
    const keyIn = v.key ?? env.STRAIT_PUBLISHABLE_KEY;
    const key = keyIn ? String(keyIn).trim() : undefined;
    result = await runDoctor({ host: normalizeHost(hostIn), key, android: v.android?.trim(), ios: v.ios?.trim(), certs: v.cert ?? [], fetch: fetchImpl });
  }
  if (secretIn) {
    // A secret key adds the engine's checks (docs/adr/0003), always shown; if they can't run, that is shown too.
    // They change the exit code only with --strict, so a CI job that already sets the key keeps passing as before.
    try {
      const call = apiClient({ apiUrl: v['api-url'] ?? env.STRAIT_API_URL ?? DEFAULT_API_URL, key: secretKey(secretIn), fetch: fetchImpl, userAgent: `strait-cli/${CLI_VERSION}` });
      result.verify = await getVerify(call);
    } catch (e) {
      if (!(e instanceof ApiError || e instanceof UsageError)) throw e;
      result.verify = { error: e.message };
    }
    if (v.strict && result.verify?.ok !== true) result.ok = false;
  }
  const text = v.json ? toJson(result) : [hostIn && formatDoctor(result), secretIn && formatAccount(result.verify, v.strict)].filter(Boolean).join('\n\n');
  out.write(text + '\n');
  return result.ok ? 0 : 1;
}

async function app({ values: v, positionals }, { out, env, io }) {
  const [sub, extra] = positionals;
  if (extra !== undefined || (sub !== undefined && sub !== 'verify'))
    throw new UsageError(`Unknown "${extra ?? sub}". strait app shows your setup; strait app verify checks it (--json for agents).`);
  const call = apiClient({ apiUrl: v['api-url'] ?? env.STRAIT_API_URL ?? DEFAULT_API_URL, key: secretKey(v['secret-key'] ?? env.STRAIT_SECRET_KEY), fetch: io.fetch ?? fetch, userAgent: `strait-cli/${CLI_VERSION}` });
  const { text, code } = await appCommand(sub, v, { call });
  out.write(text + '\n');
  return code;
}

async function selfTest({ values: v, positionals }, { out, env, io }) {
  if (positionals.length) throw new UsageError(`strait test takes no arguments ("${positionals[0]}"). Options: --secret-key, --api-url, --json.`);
  const key = secretKey(v['secret-key'] ?? env.STRAIT_SECRET_KEY);
  const apiUrl = String(v['api-url'] || env.STRAIT_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
  const fetchImpl = io.fetch ?? fetch;
  const call = apiClient({ apiUrl, key, fetch: fetchImpl, userAgent: `strait-cli/${CLI_VERSION}` });
  const result = await runSelfTest({ call, apiUrl, key, fetch: fetchImpl });
  out.write((v.json ? JSON.stringify(result, null, 2) : formatSelfTest(result)) + '\n');
  return result.ok ? 0 : 1;
}

async function events({ values: v, positionals }, { out, env, io }) {
  const [sub, name, dirArg, extra] = positionals;
  if (extra !== undefined) throw new UsageError(`Too many arguments ("${extra}"). Usage: strait events add <name> [dir] [--platform …]`);
  out.write(eventsCommand(sub, name === undefined ? [] : [name], v, { dir: resolve(io.cwd ?? process.cwd(), dirArg ?? '.'), env }) + '\n');
  return 0;
}

async function links({ values: v, positionals }, { out, env, io }) {
  const [sub, ...rest] = positionals;
  if (!['create', 'list', 'qr'].includes(sub)) return linksCommand(sub, rest, v, {});
  const key = secretKey(v['secret-key'] ?? env.STRAIT_SECRET_KEY);
  const call = apiClient({ apiUrl: v['api-url'] ?? env.STRAIT_API_URL ?? DEFAULT_API_URL, key, fetch: io.fetch ?? fetch, userAgent: `strait-cli/${CLI_VERSION}` });
  out.write((await linksCommand(sub, rest, v, { call, cwd: io.cwd ?? process.cwd() })) + '\n');
  return 0;
}
