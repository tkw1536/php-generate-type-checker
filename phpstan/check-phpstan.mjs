/**
 * Analyse committed checker + examples goldens with PHPStan.
 *
 * Does not write any files to disk. Source-map remapping is built in memory
 * from the parseable golden markers.
 *
 * Run from repo root:
 *   yarn check:phpstan
 *
 * Expects a PHPStan phar at phpstan/phpstan.phar (override with --phpstan).
 * Download with: yarn download:phpstan   (or yarn download:phpstan -- <version>)
 * `php` must already be on PATH — this script never searches for a binary.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  loadExpectedDumpSites,
  parseDumpTypeResults,
  reportDumpTypeFailures,
} from './check-phpstan.examples.mjs';
import {
  listExamplesGoldenPaths,
  listSuccessGoldenPaths,
  loadExamplesLineRanges,
  loadGoldenLineRanges,
} from './check-phpstan.fixtures.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const CHECKER_NEON = path.join(import.meta.dirname, 'generated-check.neon');
const EXAMPLES_NEON = path.join(import.meta.dirname, 'examples-check.neon');
const DEFAULT_PHPSTAN_PHAR = path.join(import.meta.dirname, 'phpstan.phar');
const DEFAULT_PHPSTAN_PHAR_REL = path.relative(REPO_ROOT, DEFAULT_PHPSTAN_PHAR);

/**
 * @param {readonly string[]} argv
 * @returns {string}
 */
function parsePhpstanPhar(argv) {
  let phar = DEFAULT_PHPSTAN_PHAR;
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--') {
      i += 1;
      continue;
    }
    if (arg === '--phpstan') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error('--phpstan requires a path to a PHPStan phar');
      }
      phar = path.resolve(value);
      i += 2;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    throw new Error(`unknown option: ${arg}`);
  }
  return phar;
}

function printUsage() {
  const script = path.relative(REPO_ROOT, import.meta.filename);
  console.error(`Usage:
  yarn check:phpstan
  yarn check:phpstan -- --phpstan <phar>

Analyse committed *.checker.golden.php (generated-check.neon) then
*.examples.golden.php (examples-check.neon; dumpType-only). Writes nothing to disk.

Place a PHPStan phar at ${DEFAULT_PHPSTAN_PHAR_REL} (default), or pass --phpstan.
Download with: yarn download:phpstan  (optional: yarn download:phpstan -- <version>)

Options:
  --phpstan <path>   Path to phpstan.phar (default: ${DEFAULT_PHPSTAN_PHAR_REL})
  -h, --help         Show this help

Example:
  yarn download:phpstan
  yarn check:phpstan
  node ${script}
`);
}

/**
 * @typedef {import('./check-phpstan.fixtures.mjs').GoldenLineRange} GoldenLineRange
 */

/**
 * @param {readonly GoldenLineRange[]} ranges
 * @param {string} basename
 * @param {number} lineNo
 * @returns {string | null}
 */
function goldenNameForLine(ranges, basename, lineNo) {
  for (const range of ranges) {
    if (
      range.basename === basename &&
      lineNo >= range.startLine &&
      lineNo <= range.endLine
    ) {
      return range.name;
    }
  }
  return null;
}

/**
 * @param {string} prefix
 * @param {readonly GoldenLineRange[]} ranges
 * @param {string} stdout
 * @returns {number} number of analysis error lines printed
 */
function printPhpstanStdout(prefix, ranges, stdout) {
  let errorCount = 0;
  for (const rawLine of stdout.split('\n')) {
    if (rawLine.length === 0) {
      continue;
    }
    const line = rawLine.startsWith(prefix)
      ? rawLine.slice(prefix.length)
      : rawLine;
    const match = /^(.+\.(?:checker|examples)\.golden\.php):(\d+):(.*)$/u.exec(
      line,
    );
    if (match === null) {
      console.log(line);
      continue;
    }
    errorCount += 1;
    const filePart = match[1];
    const lineStr = match[2];
    const rest = match[3];
    if (
      filePart === undefined ||
      lineStr === undefined ||
      rest === undefined
    ) {
      continue;
    }
    const lineNo = Number(lineStr);
    const basename = path.basename(filePart);
    const display = filePart.startsWith('/')
      ? basename
      : filePart.includes(path.sep)
        ? filePart
        : basename;
    const golden = goldenNameForLine(ranges, basename, lineNo);
    if (golden === null) {
      console.log(`${display}:${lineNo}:${rest}`);
      continue;
    }
    console.log(`${display}:${lineNo}:${rest} [golden=${golden}]`);
  }
  return errorCount;
}

/**
 * @param {string} neonPath
 * @param {readonly string[]} phpPaths
 * @param {string} pharAbs
 * @returns {{ status: number | null; stdout: string }}
 */
function spawnPhpstan(neonPath, phpPaths, pharAbs) {
  const result = spawnSync(
    'php',
    [
      pharAbs,
      'analyse',
      '--no-progress',
      '-v',
      '--error-format=raw',
      '-c',
      neonPath,
      ...phpPaths,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  return { status: result.status, stdout: result.stdout ?? '' };
}

function testdataPrefix() {
  const testdataDir = path.resolve(
    import.meta.dirname,
    '../src/generator/testdata',
  );
  return `${testdataDir}${path.sep}`;
}

/**
 * Checker goldens: every PHPStan finding is a failure.
 *
 * @param {string} neonPath
 * @param {readonly string[]} phpPaths
 * @param {readonly GoldenLineRange[]} ranges
 * @param {string} pharAbs
 * @returns {number} 0 iff no analysis errors
 */
function runCheckerPhpstan(neonPath, phpPaths, ranges, pharAbs) {
  const { status, stdout } = spawnPhpstan(neonPath, phpPaths, pharAbs);
  if (status === null) {
    console.error('PHPStan was killed by a signal');
    return 1;
  }
  const errorCount = printPhpstanStdout(testdataPrefix(), ranges, stdout);
  if (errorCount > 0) {
    return 1;
  }
  return status === 0 ? 0 : 1;
}

/**
 * Examples goldens: only phpstan.dumpType matters; each site must dump true.
 *
 * @param {string} neonPath
 * @param {readonly string[]} phpPaths
 * @param {readonly GoldenLineRange[]} ranges
 * @param {string} pharAbs
 * @returns {number} 0 iff every expected dump is true
 */
function runExamplesPhpstan(neonPath, phpPaths, ranges, pharAbs) {
  const expected = loadExpectedDumpSites(phpPaths, ranges);
  console.error(`expecting ${expected.size} dumpType(example(…)) sites`);
  const { status, stdout } = spawnPhpstan(neonPath, phpPaths, pharAbs);
  if (status === null) {
    console.error('PHPStan was killed by a signal');
    return 1;
  }
  const actual = parseDumpTypeResults(testdataPrefix(), stdout);
  const failures = reportDumpTypeFailures(expected, actual);
  return failures === 0 ? 0 : 1;
}

function main() {
  let pharPath;
  try {
    pharPath = parsePhpstanPhar(process.argv.slice(2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    printUsage();
    process.exit(1);
  }

  if (!existsSync(pharPath)) {
    console.error(
      `PHPStan phar not found at ${path.relative(REPO_ROOT, pharPath) || pharPath}.\n` +
        `Run: yarn download:phpstan\n` +
        `(or yarn download:phpstan -- <version>; or pass --phpstan).\n`,
    );
    process.exit(1);
  }

  const pharAbs = path.resolve(pharPath);

  const checkerPaths = listSuccessGoldenPaths();
  const checkerRanges = loadGoldenLineRanges();
  console.error(
    `analysing ${checkerPaths.length} checker golden files (${checkerRanges.length} cases)`,
  );
  const checkerStatus = runCheckerPhpstan(
    CHECKER_NEON,
    checkerPaths,
    checkerRanges,
    pharAbs,
  );
  if (checkerStatus !== 0) {
    process.exit(checkerStatus);
  }

  const examplesPaths = listExamplesGoldenPaths();
  const examplesRanges = loadExamplesLineRanges();
  console.error(
    `analysing ${examplesPaths.length} examples golden files (${examplesRanges.length} cases)`,
  );
  const examplesStatus = runExamplesPhpstan(
    EXAMPLES_NEON,
    examplesPaths,
    examplesRanges,
    pharAbs,
  );
  process.exit(examplesStatus);
}

main();
