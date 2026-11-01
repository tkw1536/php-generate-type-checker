/**
 * Run generated checkers against examples / counterexamples via `php` STDIN.
 *
 * Does not write goldens or temp files. Continues after each failing case.
 *
 * Run from repo root:
 *   yarn check:runtime
 *
 * `php` must already be on PATH (override with --php).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { collectRuntimeCases } from './check-runtime.cases.mjs';
import { buildHarness, caseLabel } from './check-runtime.harness.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

/**
 * @param {readonly string[]} argv
 * @returns {string}
 */
function parsePhpBin(argv) {
  let php = 'php';
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--') {
      i += 1;
      continue;
    }
    if (arg === '--php') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error('--php requires a path to a PHP binary');
      }
      php = value;
      i += 2;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return php;
}

function printUsage() {
  const script = path.relative(REPO_ROOT, import.meta.filename);
  console.error(`Usage: yarn check:runtime [-- --php <bin>]

Generate checkers for examples-eligible .IN cases and run each example /
counterexample through php on STDIN (no disk writes).
Default binary: php on PATH.
Example: yarn check:runtime && node ${script}
`);
}

/**
 * @param {string} phpBin
 * @param {string} harness
 * @returns {{ status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; error?: Error }}
 */
function runPhp(phpBin, harness) {
  const result = spawnSync(phpBin, ['--'], {
    input: harness,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  /** @type {{ status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; error?: Error }} */
  const out = {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
  if (result.error === undefined) {
    return out;
  }
  return { ...out, error: result.error };
}

/**
 * @param {string} phpBin
 */
function ensurePhp(phpBin) {
  const result = spawnSync(phpBin, ['-v'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error === undefined && result.status === 0) {
    return;
  }
  const detail =
    result.error === undefined
      ? result.stderr || result.stdout || `exit ${String(result.status)}`
      : result.error.message;
  throw new Error(
    `PHP binary not usable (${phpBin}): ${detail}\nInstall PHP 8+ and ensure it is on PATH.`,
  );
}

/**
 * @param {string} phpBin
 * @param {import('./check-runtime.cases.mjs').RuntimeCase} item
 * @returns {{ failed: boolean; skipped: boolean; assertFails: number }}
 */
function checkOneCase(phpBin, item) {
  let built;
  try {
    built = buildHarness(item);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FAIL ${caseLabel(item)}: generate error: ${message}`);
    return { failed: true, skipped: false, assertFails: 0 };
  }
  if (built === null) {
    return { failed: false, skipped: true, assertFails: 0 };
  }

  const result = runPhp(phpBin, built.harness);
  if (result.error !== undefined) {
    console.error(
      `FAIL ${caseLabel(item)}: php spawn error: ${result.error.message}`,
    );
    return { failed: true, skipped: false, assertFails: 0 };
  }
  if (result.signal !== null) {
    console.error(
      `FAIL ${caseLabel(item)}: php killed by signal ${result.signal}`,
    );
    return { failed: true, skipped: false, assertFails: 0 };
  }
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  let assertFails = 0;
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
    for (const line of result.stderr.split('\n')) {
      if (line.startsWith('FAIL ')) {
        assertFails += 1;
      }
    }
  }
  if (result.status === 0) {
    return { failed: false, skipped: false, assertFails };
  }
  if (!result.stderr.includes('FAIL ')) {
    console.error(
      `FAIL ${caseLabel(item)}: php exited ${String(result.status)} (no FAIL lines; ${built.assertCount} assert(s))`,
    );
  }
  return { failed: true, skipped: false, assertFails };
}

/**
 * @param {string} phpBin
 * @returns {number} failed case count
 */
function runAllCases(phpBin) {
  const cases = collectRuntimeCases();
  let checked = 0;
  let skipped = 0;
  let failedCases = 0;
  let failedAsserts = 0;

  console.error(`checking ${cases.length} .IN case(s) with ${phpBin}`);

  for (const item of cases) {
    const outcome = checkOneCase(phpBin, item);
    if (outcome.skipped) {
      skipped += 1;
      continue;
    }
    checked += 1;
    failedAsserts += outcome.assertFails;
    if (outcome.failed) {
      failedCases += 1;
    }
  }

  console.error(
    `done: ${checked} checked, ${skipped} skipped, ${failedCases} case failure(s), ${failedAsserts} assert failure(s)`,
  );
  return failedCases;
}

function main() {
  let phpBin;
  try {
    phpBin = parsePhpBin(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    printUsage();
    process.exit(1);
  }

  try {
    ensurePhp(phpBin);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    process.exit(1);
  }

  process.exit(runAllCases(phpBin) === 0 ? 0 : 1);
}

main();
