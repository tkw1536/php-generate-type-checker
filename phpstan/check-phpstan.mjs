/**
 * Analyse committed generator success `*.golden.php` with PHPStan.
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
  listSuccessGoldenPaths,
  loadGoldenLineRanges,
} from './check-phpstan.fixtures.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
// Config + default phar live beside this script so phpstan/ is self-contained.
const NEON_PATH = path.join(import.meta.dirname, 'generated-check.neon');
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
    // Yarn forwards a lone `--` after `yarn run … -- …`; ignore it.
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

Analyse committed generator success *.golden.php with PHPStan
(see phpstan/generated-check.neon). Writes nothing to disk.

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
 * Raw PHPStan lines look like `/abs/path/stem.golden.php:12:message`.
 * Strip the testdata directory prefix when present; always remap by basename.
 *
 * @param {string} testdataPrefix
 * @param {readonly GoldenLineRange[]} ranges
 * @param {string} stdout
 * @returns {number} number of analysis error lines printed
 */
function printPhpstanStdout(testdataPrefix, ranges, stdout) {
  let errorCount = 0;
  for (const rawLine of stdout.split('\n')) {
    if (rawLine.length === 0) {
      continue;
    }
    const line = rawLine.startsWith(testdataPrefix)
      ? rawLine.slice(testdataPrefix.length)
      : rawLine;
    const match = /^(.+\.golden\.php):(\d+):(.*)$/u.exec(line);
    if (match === null) {
      console.log(line);
      continue;
    }
    errorCount += 1;
    const filePart = match[1] ?? '';
    const lineNo = Number(match[2]);
    const rest = match[3] ?? '';
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
 * @param {readonly string[]} phpPaths
 * @param {readonly GoldenLineRange[]} ranges
 * @param {string} pharAbs
 * @returns {number} 0 iff no analysis errors
 */
function runPhpstan(phpPaths, ranges, pharAbs) {
  const testdataDir = path.resolve(
    import.meta.dirname,
    '../src/generator/testdata',
  );
  const testdataPrefix = `${testdataDir}${path.sep}`;

  // Invoke `php` by name only — never resolve or search for a binary.
  // Raw only appends [identifier=…] when verbose (or under an AI agent).
  const result = spawnSync(
    'php',
    [
      pharAbs,
      'analyse',
      '--no-progress',
      '-v',
      '--error-format=raw',
      '-c',
      NEON_PATH,
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
  if (result.status === null) {
    console.error('PHPStan was killed by a signal');
    return 1;
  }
  const errorCount = printPhpstanStdout(
    testdataPrefix,
    ranges,
    result.stdout ?? '',
  );
  // Non-zero iff analysis errors; also fail on PHPStan crash/config with no lines.
  if (errorCount > 0) {
    return 1;
  }
  return result.status === 0 ? 0 : 1;
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

  const phpPaths = listSuccessGoldenPaths();
  const ranges = loadGoldenLineRanges();
  console.error(
    `analysing ${phpPaths.length} golden files (${ranges.length} cases)`,
  );

  const status = runPhpstan(phpPaths, ranges, path.resolve(pharPath));
  process.exit(status);
}

main();
