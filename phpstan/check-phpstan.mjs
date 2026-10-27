/**
 * Generate every success golden and run PHPStan once on the packed result.
 *
 * Run from repo root:
 *   yarn check:phpstan
 *
 * Expects a PHPStan phar at phpstan/phpstan.phar (override with --phpstan).
 * `php` must already be on PATH — this script never searches for a binary.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateChecker } from '../src/generator/index.ts';
import docblockCases from '../src/generator/testdata/docblock.json' with { type: 'json' };
import docblockEmitAliasesCases from '../src/generator/testdata/docblock_emit_aliases.json' with { type: 'json' };
import functionCases from '../src/generator/testdata/function.json' with { type: 'json' };
import multiCommentCases from '../src/generator/testdata/multi_comment.json' with { type: 'json' };
import privateStaticCases from '../src/generator/testdata/private_static.json' with { type: 'json' };
import protectedStaticCases from '../src/generator/testdata/protected_static.json' with { type: 'json' };
import publicStaticCases from '../src/generator/testdata/public_static.json' with { type: 'json' };
import sealedShapesCases from '../src/generator/testdata/sealed_shapes.json' with { type: 'json' };
import verbosePhpdocCases from '../src/generator/testdata/verbose_phpdoc.json' with { type: 'json' };

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
// Config + default phar live beside this script so phpstan/ is self-contained.
const NEON_PATH = path.join(import.meta.dirname, 'generated-check.neon');
const DEFAULT_PHPSTAN_PHAR = path.join(import.meta.dirname, 'phpstan.phar');
const DEFAULT_PHPSTAN_PHAR_REL = path.relative(REPO_ROOT, DEFAULT_PHPSTAN_PHAR);

const OUTPUT_MODES = new Set([
  'function',
  'public_static',
  'protected_static',
  'private_static',
]);

/**
 * @typedef {{
 *   readonly name: string;
 *   readonly input: string;
 *   readonly output: string;
 *   readonly emitPhpstanTypeAliases?: boolean;
 *   readonly verbosePhpdoc?: boolean;
 *   readonly sealArrayShapes?: boolean;
 * }} SuccessFixture
 */

/**
 * @param {unknown} value
 * @returns {value is { readonly input: string; readonly expected: string }}
 */
function isSuccessCase(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    'expected' in value &&
    typeof value.input === 'string' &&
    typeof value.expected === 'string'
  );
}

/**
 * @param {unknown} value
 * @returns {value is {
 *   readonly input: string;
 *   readonly output: string;
 *   readonly expected: string;
 *   readonly emitPhpstanTypeAliases?: boolean;
 *   readonly verbosePhpdoc?: boolean;
 *   readonly sealArrayShapes?: boolean;
 * }}
 */
function isDocblockCase(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    'output' in value &&
    'expected' in value &&
    typeof value.input === 'string' &&
    typeof value.output === 'string' &&
    typeof value.expected === 'string'
  );
}

/**
 * @param {unknown} data
 * @param {string} output
 * @returns {SuccessFixture[]}
 */
function successToFixtures(data, output) {
  if (!Array.isArray(data) || !data.every((item) => isSuccessCase(item))) {
    throw new Error(`invalid success fixture JSON for output ${output}`);
  }
  return data.map(({ input }) => ({
    name: output === 'function' ? input : `${output}: ${input}`,
    input,
    output,
  }));
}

/**
 * @param {unknown} data
 * @param {string} labelPrefix
 * @returns {SuccessFixture[]}
 */
function docblockToFixtures(data, labelPrefix) {
  if (!Array.isArray(data) || !data.every((item) => isDocblockCase(item))) {
    throw new Error(`invalid docblock fixture JSON for ${labelPrefix}`);
  }
  return data.map((item, index) => {
    const {
      input,
      output,
      emitPhpstanTypeAliases,
      verbosePhpdoc,
      sealArrayShapes,
    } = item;
    if (!OUTPUT_MODES.has(output)) {
      throw new Error(`invalid output mode in ${labelPrefix}: ${output}`);
    }
    const extras = [
      emitPhpstanTypeAliases === true ? ' + aliases' : '',
      verbosePhpdoc === true ? ' + verbose' : '',
      sealArrayShapes === true ? ' + seal' : '',
    ].join('');
    const label =
      data.length === 1
        ? `${labelPrefix}: ${output}${extras}`
        : `${labelPrefix}[${index}]: ${output}${extras}`;
    /** @type {SuccessFixture} */
    const fixture = { name: label, input, output };
    if (emitPhpstanTypeAliases === true) {
      fixture.emitPhpstanTypeAliases = true;
    }
    if (verbosePhpdoc === true) {
      fixture.verbosePhpdoc = true;
    }
    if (sealArrayShapes === true) {
      fixture.sealArrayShapes = true;
    }
    return fixture;
  });
}

/**
 * Success goldens only — error fixtures throw and have no PHP to analyse.
 *
 * @returns {SuccessFixture[]}
 */
function loadSuccessFixtures() {
  return [
    ...successToFixtures(functionCases, 'function'),
    ...successToFixtures(publicStaticCases, 'public_static'),
    ...successToFixtures(protectedStaticCases, 'protected_static'),
    ...successToFixtures(privateStaticCases, 'private_static'),
    ...docblockToFixtures(docblockCases, 'docblock'),
    ...docblockToFixtures(docblockEmitAliasesCases, 'docblock_emit_aliases'),
    ...docblockToFixtures(multiCommentCases, 'multi_comment'),
    ...docblockToFixtures(verbosePhpdocCases, 'verbose_phpdoc'),
    ...docblockToFixtures(sealedShapesCases, 'sealed_shapes'),
  ].toSorted((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {string[]} argv
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
  const script = path.relative(REPO_ROOT, fileURLToPath(import.meta.url));
  console.error(`Usage:
  yarn check:phpstan
  yarn check:phpstan -- --phpstan <phar>

Generate every success golden and analyse the packed PHP with PHPStan
(see phpstan/generated-check.neon).

Place a PHPStan phar at ${DEFAULT_PHPSTAN_PHAR_REL} (default), or pass --phpstan.

Options:
  --phpstan <path>   Path to phpstan.phar (default: ${DEFAULT_PHPSTAN_PHAR_REL})
  -h, --help         Show this help

Example:
  yarn check:phpstan
  node ${script}
`);
}

/**
 * Re-generate rather than trusting golden JSON `expected`, so analysis always
 * reflects the current pipeline.
 *
 * @param {SuccessFixture} fixture
 * @returns {string}
 */
function generateFixture(fixture) {
  return generateChecker(fixture.input, {
    output: /** @type {import('../src/generator/options.ts').CheckerOutputMode} */ (
      fixture.output
    ),
    emitPhpstanTypeAliases: fixture.emitPhpstanTypeAliases,
    verbosePhpdoc: fixture.verbosePhpdoc,
    sealArrayShapes: fixture.sealArrayShapes,
  });
}

/**
 * @typedef {{
 *   readonly name: string;
 *   readonly startLine: number;
 *   readonly endLine: number;
 * }} GoldenLineRange
 */

/**
 * Pack all goldens into one file for a single analyse pass: PHPStan needs a
 * real filesystem path (no stdin/fd), and one write + one startup beats
 * per-case IO. Each case gets its own namespace so repeated `isInt` /
 * `TypeChecker` names do not collide. No class stubs yet — missing-symbol
 * noise is deferred. Ranges are 1-based inclusive line spans in the packed
 * file so PHPStan hits can be attributed to a fixture.
 *
 * @param {readonly { readonly name: string; readonly php: string }[]} cases
 * @returns {{ readonly php: string; readonly ranges: readonly GoldenLineRange[] }}
 */
function packGoldensPhp(cases) {
  const width = String(cases.length).length;
  /** @type {GoldenLineRange[]} */
  const ranges = [];
  let out = '<?php\n';
  // Next 1-based line number that newly appended text will occupy.
  let line = 2;

  for (let i = 0; i < cases.length; i++) {
    const item = cases[i];
    if (item === undefined) {
      throw new Error('never reached');
    }
    if (i > 0) {
      out += '\n';
      line += 1;
    }
    const ns = `Golden\\C${String(i).padStart(width, '0')}`;
    const body = item.php.endsWith('\n') ? item.php : `${item.php}\n`;
    // Marker comment is for humans reading a kept dump; ranges drive CLI attribution.
    const block = `// golden: ${item.name}\nnamespace ${ns} {\n${body}}\n`;
    const startLine = line;
    const lineCount = block.endsWith('\n')
      ? block.split('\n').length - 1
      : block.split('\n').length;
    const endLine = startLine + lineCount - 1;
    ranges.push({ name: item.name, startLine, endLine });
    out += block;
    line = endLine + 1;
  }

  return { php: out, ranges };
}

/**
 * @param {readonly GoldenLineRange[]} ranges
 * @param {number} lineNo
 * @returns {string | null}
 */
function goldenNameForLine(ranges, lineNo) {
  for (const range of ranges) {
    if (lineNo >= range.startLine && lineNo <= range.endLine) {
      return range.name;
    }
  }
  return null;
}

/**
 * PHPStan cannot analyse `/dev/fd` / process-substitution paths (Finder treats
 * them as missing directories), so the packed file must be a real temp path.
 * Stderr (Turbo ads, agent preambles) is ignored; stdout is re-printed with the
 * temp directory stripped so lines stay readable (`goldens.php:line:…`).
 *
 * @param {string} phpSource
 * @param {readonly GoldenLineRange[]} ranges
 * @param {string} pharAbs
 * @returns {number}
 */
function runPhpstan(phpSource, ranges, pharAbs) {
  const dir = mkdtempSync(path.join(tmpdir(), 'php-generate-type-checker-'));
  const phpPath = path.join(dir, 'goldens.php');
  writeFileSync(phpPath, phpSource, 'utf8');
  // Prefix PHPStan puts on raw lines; strip it so output is just the basename.
  const pathPrefix = `${dir}${path.sep}`;

  try {
    // Invoke `php` by name only — never resolve or search for a binary.
    const result = spawnSync(
      'php',
      [
        pharAbs,
        'analyse',
        '--no-progress',
        // Raw only appends [identifier=…] when verbose (or under an AI agent).
        '-v',
        '--error-format=raw',
        '-c',
        NEON_PATH,
        phpPath,
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    if (result.error !== undefined) {
      throw result.error;
    }
    const stdout = result.stdout ?? '';
    for (const rawLine of stdout.split('\n')) {
      if (rawLine.length === 0) {
        continue;
      }
      const line = rawLine.startsWith(pathPrefix)
        ? rawLine.slice(pathPrefix.length)
        : rawLine;
      const match = /^goldens\.php:(\d+):(.*)$/u.exec(line);
      if (match === null) {
        console.log(line);
        continue;
      }
      const lineNo = Number(match[1]);
      const rest = match[2] ?? '';
      const golden = goldenNameForLine(ranges, lineNo);
      if (golden === null) {
        console.log(line);
        continue;
      }
      console.log(`goldens.php:${lineNo}:${rest} [golden=${golden}]`);
    }
    return result.status ?? 1;
  } finally {
    try {
      unlinkSync(phpPath);
    } catch {
      // best-effort cleanup
    }
    try {
      rmdirSync(dir);
    } catch {
      // best-effort cleanup
    }
  }
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
        `Download phpstan.phar into ${DEFAULT_PHPSTAN_PHAR_REL}, or pass --phpstan <path>.`,
    );
    process.exit(1);
  }

  const fixtures = loadSuccessFixtures();
  /** @type {{ readonly name: string; readonly php: string }[]} */
  const generated = [];
  for (const fixture of fixtures) {
    try {
      generated.push({
        name: fixture.name,
        php: generateFixture(fixture),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`generate failed for ${fixture.name}: ${message}`);
      process.exit(1);
    }
  }

  const { php: phpSource, ranges } = packGoldensPhp(generated);
  console.error(
    `packed ${generated.length} goldens (${phpSource.length} bytes)`,
  );

  const status = runPhpstan(phpSource, ranges, path.resolve(pharPath));
  process.exit(status);
}

main();
