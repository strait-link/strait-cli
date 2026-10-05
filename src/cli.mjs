// Argument parsing and prompting. `main(argv, io)` returns an exit code, so tests
// can drive it without spawning a process.
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { detectProject } from './detect.mjs';
import { formatPlan, planInit, writeFiles } from './init.mjs';
import { UsageError, normalizeHost, normalizeKey, normalizeScheme, suggestScheme } from './validate.mjs';
import { resolve } from 'node:path';

export const HELP = `strait: set up Strait deep links in your app

Usage
  strait init [dir] [options]

Options
  --key <st_pub_live_…>   Publishable key (Dashboard → Get started)
  --host <host>           Your link domain, e.g. acme.strait.link
  --scheme <scheme>       Your app's custom scheme, e.g. acmeshop (guessed from the package name)
  --framework <name>      react-native | expo | flutter | android (detected by default)
  --dry-run               Print what would be written; write nothing
  --force                 Replace an existing integration file
  --yes, -y               Never prompt; fail if something is missing
  --help, -h              Show this help

Environment
  STRAIT_PUBLISHABLE_KEY, STRAIT_LINK_HOST are used when the flags are absent.

Examples
  npx @straitlink/cli init
  npx @straitlink/cli init --key st_pub_live_… --host acme.strait.link --dry-run
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
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        key: { type: 'string' },
        host: { type: 'string' },
        scheme: { type: 'string' },
        framework: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        yes: { type: 'boolean', short: 'y', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (e) {
    err.write(`${e.message}\n\n${HELP}`);
    return 2;
  }
  const [cmd, dirArg] = args.positionals;
  if (args.values.help || !cmd) {
    out.write(HELP);
    return args.values.help ? 0 : 2;
  }
  if (cmd !== 'init') {
    err.write(`Unknown command "${cmd}".\n\n${HELP}`);
    return 2;
  }

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
          scheme = await askValid(ask, `Custom scheme${guess ? ` [${guess}]` : ''}: `, (a) => normalizeScheme(a || guess || ''), err);
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
