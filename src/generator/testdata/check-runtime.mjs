/**
 * Run generated checkers against examples / counterexamples via `php` STDIN.
 *
 * Builds one batched PHP program (namespaced cases + main()); does not write
 * goldens or temp files. Continues after generate failures; PHP still runs the
 * remaining cases.
 *
 * Run from repo root:
 *   yarn check:runtime
 *
 * `php` must already be on PATH (override with --php).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { collectRuntimeCases } from './check-runtime.cases.mjs';
import {
  assembleBatchPhp,
  caseLabel,
  tryBuildCaseFragment,
} from './check-runtime.harness.mjs';

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

Generate checkers for examples-eligible .IN cases and run them as one
batched php STDIN program (namespaced cases + main(); no disk writes).
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

/** @param {string} phpBin */
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

/** @param {string} stderr @returns {number} */
function countFailLines(stderr) {
  let n = 0;
  for (const line of stderr.split('\n')) {
    if (line.startsWith('FAIL ')) {
      n += 1;
    }
  }
  return n;
}

/**
 * @typedef {{
 *   readonly fragments: readonly import('./check-runtime.harness.mjs').CaseFragment[];
 *   readonly skipped: number;
 *   readonly generateFails: number;
 *   readonly totalAsserts: number;
 * }} BuiltBatch
 */

/** @param {string} phpBin @returns {BuiltBatch} */
function buildFragments(phpBin) {
  const cases = collectRuntimeCases();
  /** @type {import('./check-runtime.harness.mjs').CaseFragment[]} */
  const fragments = [];
  let skipped = 0;
  let generateFails = 0;
  let totalAsserts = 0;
  console.error(`checking ${cases.length} .IN case(s) with ${phpBin}`);
  for (const item of cases) {
    let fragment;
    try {
      fragment = tryBuildCaseFragment(item);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FAIL ${caseLabel(item)}: generate error: ${message}`);
      generateFails += 1;
      continue;
    }
    if (fragment === null) {
      skipped += 1;
      continue;
    }
    fragments.push(fragment);
    totalAsserts += fragment.assertCount;
  }
  return { fragments, skipped, generateFails, totalAsserts };
}

/**
 * @param {string} message
 * @param {number} checked
 * @param {number} skipped
 * @param {number} failedCases
 */
function printHardFail(message, checked, skipped, failedCases) {
  console.error(message);
  console.error(
    `done: ${checked} checked, ${skipped} skipped, ${failedCases} case failure(s), 0 assert failure(s)`,
  );
}

/**
 * @param {{ readonly status: number | null; readonly stdout: string; readonly stderr: string }} result
 * @param {number} totalAsserts
 * @param {number} caseCount
 * @returns {{ phpCaseFails: number; assertFails: number }}
 */
function interpretBatchResult(result, totalAsserts, caseCount) {
  if (result.stdout.length > 0) {
    process.stdout.write(result.stdout);
  }
  let assertFails = 0;
  if (result.stderr.length > 0) {
    process.stderr.write(result.stderr);
    assertFails = countFailLines(result.stderr);
  }
  const status = result.status ?? 1;
  if (status === 0) {
    return { phpCaseFails: 0, assertFails };
  }
  if (assertFails > 0 && status > 0) {
    return { phpCaseFails: status, assertFails };
  }
  console.error(
    `FAIL batch: php exited ${String(status)} (no FAIL lines; ${totalAsserts} assert(s) across ${caseCount} case(s))`,
  );
  return { phpCaseFails: 1, assertFails };
}

/**
 * @param {string} phpBin
 * @param {BuiltBatch} batch
 * @returns {{ phpCaseFails: number; assertFails: number } | null}
 */
function runBatchPhp(phpBin, batch) {
  const { fragments, skipped, generateFails, totalAsserts } = batch;
  let harness;
  try {
    harness = assembleBatchPhp(fragments);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    printHardFail(
      `FAIL batch assemble: ${message}`,
      0,
      skipped,
      generateFails + 1,
    );
    return null;
  }
  const result = runPhp(phpBin, harness);
  if (result.error !== undefined) {
    printHardFail(
      `FAIL batch: php spawn error: ${result.error.message}`,
      fragments.length,
      skipped,
      generateFails + 1,
    );
    return null;
  }
  if (result.signal !== null) {
    printHardFail(
      `FAIL batch: php killed by signal ${result.signal}`,
      fragments.length,
      skipped,
      generateFails + 1,
    );
    return null;
  }
  return interpretBatchResult(result, totalAsserts, fragments.length);
}

/** @param {string} phpBin @returns {number} */
function runAllCases(phpBin) {
  const batch = buildFragments(phpBin);
  let phpCaseFails = 0;
  let assertFails = 0;
  if (batch.fragments.length > 0) {
    const outcome = runBatchPhp(phpBin, batch);
    if (outcome === null) {
      return batch.generateFails + 1;
    }
    phpCaseFails = outcome.phpCaseFails;
    assertFails = outcome.assertFails;
  }
  const failedCases = batch.generateFails + phpCaseFails;
  console.error(
    `done: ${batch.fragments.length} checked, ${batch.skipped} skipped, ${failedCases} case failure(s), ${assertFails} assert failure(s)`,
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
