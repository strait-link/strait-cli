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
};

export const HELP = `strait: set up and check Strait deep links, and manage links

Usage
  strait init [dir] [options]                 Write the Strait integration into your app
  strait doctor --host <host> [options]       Check your link host is set up for your app
  strait links create <slug> <url> [options]  Create a link
  strait links list [options]                 List links
  strait links qr <slug> [options]            Save a link's QR code

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

Environment
  STRAIT_PUBLISHABLE_KEY, STRAIT_LINK_HOST, STRAIT_SECRET_KEY, STRAIT_API_URL

Examples
  npx @straitlink/cli init
  npx @straitlink/cli init --key st_pub_live_… --host acme.strait.link --dry-run
  npx @straitlink/cli doctor --host acme.strait.link --android com.acme.shop --ios com.acme.shop
  STRAIT_SECRET_KEY=st_live_… npx @straitlink/cli links create summer https://acme.com/summer
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
      return await (cmd === 'doctor' ? doctor : links)(args, { out, err, env, io });
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
  if (!hostIn) throw new UsageError('Missing --host: your link domain from Dashboard → Get started, e.g. --host acme.strait.link.');
  const host = normalizeHost(hostIn);
  const keyIn = v.key ?? env.STRAIT_PUBLISHABLE_KEY;
  const key = keyIn ? String(keyIn).trim() : undefined;
  const result = await runDoctor({ host, key, android: v.android?.trim(), ios: v.ios?.trim(), certs: v.cert ?? [], fetch: io.fetch ?? fetch });
  out.write((v.json ? JSON.stringify(result, null, 2) : formatDoctor(result)) + '\n');
  return result.ok ? 0 : 1;
}

async function links({ values: v, positionals }, { out, env, io }) {
  const [sub, ...rest] = positionals;
  if (!['create', 'list', 'qr'].includes(sub)) return linksCommand(sub, rest, v, {});
  const key = secretKey(v['secret-key'] ?? env.STRAIT_SECRET_KEY);
  const call = apiClient({ apiUrl: v['api-url'] ?? env.STRAIT_API_URL ?? DEFAULT_API_URL, key, fetch: io.fetch ?? fetch, userAgent: `strait-cli/${CLI_VERSION}` });
  out.write((await linksCommand(sub, rest, v, { call, cwd: io.cwd ?? process.cwd() })) + '\n');
  return 0;
}
