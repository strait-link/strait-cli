// `strait init`: detect the app, collect key + host + scheme, write the
// integration file(s), print the platform steps. Pure planning is separated from
// writing so --dry-run and the tests see exactly what would happen.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { FRAMEWORKS, LABELS, describeFolder, detectProject } from './detect.mjs';
import { INSTALL } from './install.mjs';
import { integrationFiles, nextSteps } from './templates.mjs';
import { UsageError, normalizeHost, normalizeKey, normalizeScheme, suggestScheme } from './validate.mjs';

/**
 * Works out everything without touching the disk.
 * @param {object} o { dir, key, host, scheme, framework, force }
 * @returns {{ project, opts, files: Array<{path, abs, contents, why, exists}>, edits: Array<{path, abs, contents, why, line}>, steps, conflicts: string[] }}
 */
export function planInit({ dir, key, host, scheme, framework, force = false, installSource = INSTALL }) {
  const root = resolve(dir ?? '.');
  let project = detectProject(root);
  if (framework) {
    if (!FRAMEWORKS.includes(framework)) throw new UsageError(`--framework must be one of ${FRAMEWORKS.join(', ')}`);
    project = project && project.framework === framework ? project : { ...(project ?? emptyProject(root)), framework, label: LABELS[framework] };
  }
  if (!project) {
    throw new UsageError(
      `No React Native, Expo, Flutter or Android app found in ${root} (it has: ${describeFolder(root)}). ` +
        'Run this in your app folder, or pass --framework react-native|expo|flutter|android.',
    );
  }
  const k = normalizeKey(key);
  const h = normalizeHost(host);
  const chosen = scheme ?? suggestScheme(project);
  if (!chosen) throw new UsageError("Couldn't guess your app's custom scheme. Pass --scheme, for example --scheme acmeshop.");
  const opts = { key: k, host: h, scheme: normalizeScheme(chosen) };
  // Said out loud in the output: the developer may have made up a different scheme in Apps & stores.
  const schemeGuessedFrom =
    scheme || project.scheme ? null : suggestScheme({ androidPackage: project.androidPackage }) ? `the package name ${project.androidPackage}` : `the app name ${project.appName}`;
  const files = integrationFiles(project, opts).map((f) => {
    const abs = join(root, f.path);
    return { ...f, abs, exists: existsSync(abs) };
  });
  const conflicts = force ? [] : files.filter((f) => f.exists).map((f) => f.path);
  return { project, opts, schemeGuessedFrom, files, edits: manifestEdits(project, root), steps: nextSteps(project, opts, installSource), conflicts };
}

// Flutter's template declares INTERNET only in the debug/profile manifests and an Android Studio
// template not at all, so a release build can't reach Strait (QA 9 Nov 2026). React Native's and
// Expo's templates already have it.
const INTERNET = '<uses-permission android:name="android.permission.INTERNET" />';

function manifestEdits(project, root) {
  if (!['flutter', 'android'].includes(project.framework) || !project.manifestPath) return [];
  const contents = addInternetPermission(readFileSync(project.manifestPath, 'utf8'));
  if (!contents) return [];
  const path = relative(root, project.manifestPath).split('\\').join('/');
  return [{ path, abs: project.manifestPath, contents, line: INTERNET, why: 'adds the INTERNET permission release builds need' }];
}

/** The manifest with INTERNET added right after <manifest …>, or null when it already has it (or isn't a manifest). */
export function addInternetPermission(text) {
  const live = text.replace(/<!--[\s\S]*?-->/g, (c) => ' '.repeat(c.length)); // same length: indexes still match text
  if (/<uses-permission\b[^>]*android:name\s*=\s*"android\.permission\.INTERNET"/.test(live)) return null;
  const open = /<manifest\b[^>]*>/.exec(live);
  if (!open) return null;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const at = open.index + open[0].length;
  const pad = /\n([ \t]*)\S/.exec(live.slice(at))?.[1] || '    '; // the next element's indent
  return `${text.slice(0, at)}${eol}${pad}${INTERNET}${text.slice(at)}`;
}

function emptyProject(dir) {
  return { dir, appName: null, androidPackage: null, iosBundleId: null, scheme: null, typescript: false, expoRouter: false, sdkInstalled: false, manifestPath: null, manifest: { schemes: [], hosts: [] } };
}

/** Writes the planned files. Returns the paths written. */
export function writeFiles(plan) {
  if (plan.conflicts.length) throw new UsageError(`Not overwriting ${plan.conflicts.join(', ')}. Use --force to replace, or delete it first.`);
  for (const f of plan.files) {
    mkdirSync(dirname(f.abs), { recursive: true });
    writeFileSync(f.abs, f.contents);
  }
  for (const e of plan.edits ?? []) writeFileSync(e.abs, e.contents);
  return [...plan.files, ...(plan.edits ?? [])].map((f) => f.path);
}

// ---------- output ----------

const indent = (s, n = 4) => s.split('\n').map((l) => (l ? ' '.repeat(n) + l : l)).join('\n');

export function formatPlan(plan, { dryRun = false } = {}) {
  const { project, opts, files, steps } = plan;
  const out = [];
  const facts = [project.label, project.androidPackage && `package ${project.androidPackage}`, project.expoRouter && 'Expo Router', project.typescript && 'TypeScript'].filter(Boolean);
  out.push(`Found: ${facts.join(' · ')}`);
  out.push(`Link host: ${opts.host} · scheme: ${opts.scheme}://${plan.schemeGuessedFrom ? ` (guessed from ${plan.schemeGuessedFrom})` : ''}`);
  if (plan.schemeGuessedFrom) {
    out.push(
      'If you made up your own scheme (Custom scheme in Dashboard → Apps & stores), ' +
        (dryRun
          ? 'run this again with --scheme yourscheme, so every line below uses it.'
          : `use it in place of ${opts.scheme} in the steps below: the files written don't contain the scheme, so you don't need --force. ` +
            'To reprint the steps with it, run this again with --scheme yourscheme --dry-run.'),
    );
  }
  out.push('');
  out.push(
    !dryRun
      ? 'Created:'
      : plan.conflicts.length
        ? `Dry run: nothing written. A real run would stop: ${plan.conflicts.join(', ')} already exists (add --force to replace it). With --force it would write:`
        : 'Dry run: nothing written. These files would be created:',
  );
  // A conflict is a file the real run refuses to overwrite (no --force): never call it replaced.
  const label = (f) => (plan.conflicts.includes(f.path) ? ' (already exists: kept unless --force)' : f.exists ? ' (replaced)' : '');
  for (const f of files) out.push(`  ${f.path}${label(f)}  ${f.why}`);
  if (plan.edits?.length) {
    out.push('');
    out.push(dryRun ? 'Would edit:' : 'Edited:');
    for (const e of plan.edits) out.push(`  ${e.path}  ${e.why}`);
  }
  if (dryRun) {
    for (const f of files) {
      out.push('');
      out.push(`--- ${f.path}`);
      out.push(f.contents.trimEnd());
    }
    for (const e of plan.edits ?? []) {
      out.push('');
      out.push(`--- ${e.path}`);
      out.push(`+    ${e.line}`);
    }
  }
  out.push('');
  out.push('Next steps:');
  steps.forEach((s, i) => {
    out.push('');
    out.push(`${i + 1}. ${s.title}${s.done ? '  [already done]' : ''}`);
    if (s.body) out.push(indent(s.body, 3));
    if (s.code) out.push(indent(s.code));
  });
  out.push('');
  out.push('Docs: https://straitlink.in/docs/   Checker: https://straitlink.in/tools/app-links-checker/');
  return out.join('\n');
}
