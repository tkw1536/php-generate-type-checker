/**
 * Resolve success checker / examples golden suites for `check-phpstan.mjs`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SUCCESS_GOLDEN_STEMS } from '../src/generator/testdata/goldenCase.ts';
import { parseGoldenPhp } from '../src/generator/testdata/goldenPhp.ts';
import { parseExamplesGoldenPhp } from '../src/generator/testdata/examplesGolden.ts';

const TESTDATA_DIR = path.resolve(
  import.meta.dirname,
  '../src/generator/testdata',
);

const MODE_STEMS = new Set([
  'function',
  'public_static',
  'protected_static',
  'private_static',
]);

const EXAMPLES_STEMS = SUCCESS_GOLDEN_STEMS.filter(
  (stem) =>
    stem === 'function' ||
    !MODE_STEMS.has(stem),
);

/**
 * @typedef {{
 *   readonly file: string;
 *   readonly basename: string;
 *   readonly name: string;
 *   readonly startLine: number;
 *   readonly endLine: number;
 * }} GoldenLineRange
 */

/**
 * @param {string} stem
 * @param {import('../src/generator/testdata/goldenCase.ts').GoldenCaseMeta} meta
 * @param {number} index
 * @param {number} suiteSize
 * @returns {string}
 */
function fixtureName(stem, meta, index, suiteSize) {
  if (MODE_STEMS.has(stem)) {
    return meta.output === 'function'
      ? meta.input
      : `${meta.output}: ${meta.input}`;
  }
  const extras = [
    meta.emitPhpstanTypeAliases === true ? ' + aliases' : '',
    meta.verbosePhpdoc === true ? ' + verbose' : '',
    meta.sealArrayShapes === true ? ' + seal' : '',
  ].join('');
  return suiteSize === 1
    ? `${stem}: ${meta.output}${extras}`
    : `${stem}[${index}]: ${meta.output}${extras}`;
}

/**
 * Absolute paths to every success checker golden PHP file.
 *
 * @returns {readonly string[]}
 */
export function listSuccessGoldenPaths() {
  /** @type {string[]} */
  const paths = [];
  for (const stem of SUCCESS_GOLDEN_STEMS) {
    const filePath = path.join(TESTDATA_DIR, `${stem}.checker.golden.php`);
    if (!existsSync(filePath)) {
      throw new Error(`missing success golden: ${filePath}`);
    }
    paths.push(filePath);
  }
  return paths;
}

/**
 * Absolute paths to every examples golden PHP file.
 *
 * @returns {readonly string[]}
 */
export function listExamplesGoldenPaths() {
  /** @type {string[]} */
  const paths = [];
  for (const stem of EXAMPLES_STEMS) {
    const filePath = path.join(TESTDATA_DIR, `${stem}.examples.golden.php`);
    if (!existsSync(filePath)) {
      throw new Error(`missing examples golden: ${filePath}`);
    }
    paths.push(filePath);
  }
  return paths;
}

/**
 * In-memory source map for checker goldens.
 *
 * @returns {readonly GoldenLineRange[]}
 */
export function loadGoldenLineRanges() {
  /** @type {GoldenLineRange[]} */
  const ranges = [];
  for (const stem of SUCCESS_GOLDEN_STEMS) {
    const filePath = path.join(TESTDATA_DIR, `${stem}.checker.golden.php`);
    const basename = path.basename(filePath);
    const cases = parseGoldenPhp(readFileSync(filePath, 'utf8'));
    for (let index = 0; index < cases.length; index++) {
      const item = cases[index];
      if (item === undefined) {
        throw new Error('never reached');
      }
      ranges.push({
        file: filePath,
        basename,
        name: fixtureName(stem, item.meta, index, cases.length),
        startLine: item.startLine,
        endLine: item.endLine,
      });
    }
  }
  return ranges;
}

/**
 * In-memory source map for examples goldens.
 *
 * @returns {readonly GoldenLineRange[]}
 */
export function loadExamplesLineRanges() {
  /** @type {GoldenLineRange[]} */
  const ranges = [];
  for (const stem of EXAMPLES_STEMS) {
    const filePath = path.join(TESTDATA_DIR, `${stem}.examples.golden.php`);
    const basename = path.basename(filePath);
    const cases = parseExamplesGoldenPhp(
      readFileSync(filePath, 'utf8'),
      stem,
    );
    for (let index = 0; index < cases.length; index++) {
      const item = cases[index];
      if (item === undefined) {
        throw new Error('never reached');
      }
      ranges.push({
        file: filePath,
        basename,
        name: `examples ${stem}: ${item.meta.input}`,
        startLine: item.startLine,
        endLine: item.endLine,
      });
    }
  }
  return ranges;
}
