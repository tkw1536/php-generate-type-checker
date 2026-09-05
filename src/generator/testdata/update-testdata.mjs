/**
 * Regenerates generator fixture JSON from .IN source lists.
 * Run from repo root: yarn update_fixtures:generator
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateChecker } from '../index.ts';

const testdataDir = import.meta.dirname;

/** @type {readonly string[]} */
const OUTPUT_MODES = [
  'function',
  'public_static',
  'protected_static',
  'private_static',
];

/**
 * @param {string} line
 * @returns {string}
 */
function trimLine(line) {
  return line.trim();
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isSourceLine(line) {
  return line.length > 0 && !line.startsWith('#');
}

/**
 * @param {string} block
 * @returns {string}
 */
function trimBlock(block) {
  return block.trim();
}

/**
 * @param {string} block
 * @returns {boolean}
 */
function isNonEmptyBlock(block) {
  return block.length > 0;
}

/**
 * @param {string} inPath
 * @returns {string[]}
 */
function readSources(inPath) {
  return readFileSync(inPath, 'utf8')
    .split('\n')
    .map((line) => trimLine(line))
    .filter((line) => isSourceLine(line));
}

/**
 * @typedef {{
 *   readonly input: string;
 *   readonly output: string;
 *   readonly emitPhpstanTypeAliases: boolean;
 *   readonly verbosePhpdoc: boolean;
 * }} MultilineCase
 */

/**
 * @param {string} inPath
 * @returns {MultilineCase[]}
 */
function readMultilineCases(inPath) {
  return readFileSync(inPath, 'utf8')
    .split('\n---\n')
    .map((block) => trimBlock(block))
    .filter((block) => isNonEmptyBlock(block))
    .map((block) => parseMultilineCase(block));
}

/**
 * @param {string} block
 * @returns {MultilineCase}
 */
function parseMultilineCase(block) {
  const lines = block.split('\n');
  let output = 'function';
  let emitPhpstanTypeAliases = false;
  let verbosePhpdoc = false;
  let start = 0;

  while (start < lines.length && lines[start].startsWith('#')) {
    const line = lines[start].trim();
    const outputMatch = /^#\s*output:\s*(\S+)/u.exec(line);
    if (outputMatch) {
      output = outputMatch[1];
    }
    const emitMatch = /^#\s*emitAliases:\s*1/u.exec(line);
    if (emitMatch) {
      emitPhpstanTypeAliases = true;
    }
    const verboseMatch = /^#\s*verbosePhpdoc:\s*1/u.exec(line);
    if (verboseMatch) {
      verbosePhpdoc = true;
    }
    start++;
  }

  const input = lines.slice(start).join('\n').trim();
  return { input, output, emitPhpstanTypeAliases, verbosePhpdoc };
}

/**
 * @param {string} input
 * @returns {{ input: string }}
 */
function toErrorCase(input) {
  return { input };
}

for (const output of OUTPUT_MODES) {
  const inPath = path.join(testdataDir, `${output}.IN`);
  if (!existsSync(inPath)) {
    continue;
  }
  const sources = readSources(inPath);
  /** @type {{ input: string; expected: string }[]} */
  const out = [];
  for (const input of sources) {
    try {
      const expected = generateChecker(input, { output });
      out.push({ input, expected });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('skip', output, JSON.stringify(input), message);
    }
  }
  const fixturePath = path.resolve(testdataDir, `${output}.json`);
  writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${out.length} cases to ${fixturePath}`);
}

const DOCBlock_FIXTURES = [
  { name: 'docblock', emitPhpstanTypeAliases: false },
  { name: 'docblock_emit_aliases', emitPhpstanTypeAliases: true },
  { name: 'multi_comment', emitPhpstanTypeAliases: false },
  { name: 'verbose_phpdoc', emitPhpstanTypeAliases: false },
];

for (const { name, emitPhpstanTypeAliases: defaultEmit } of DOCBlock_FIXTURES) {
  const inPath = path.join(testdataDir, `${name}.IN`);
  if (!existsSync(inPath)) {
    continue;
  }
  const cases = readMultilineCases(inPath);
  /** @type {{ input: string; output: string; expected: string; emitPhpstanTypeAliases?: boolean; verbosePhpdoc?: boolean }[]} */
  const out = [];
  for (const {
    input,
    output,
    emitPhpstanTypeAliases,
    verbosePhpdoc,
  } of cases) {
    const emit = emitPhpstanTypeAliases || defaultEmit;
    try {
      const expected = generateChecker(input, {
        output,
        emitPhpstanTypeAliases: emit,
        verbosePhpdoc,
      });
      /** @type {{ input: string; output: string; expected: string; emitPhpstanTypeAliases?: boolean; verbosePhpdoc?: boolean }} */
      const entry = { input, output, expected };
      if (emit) {
        entry.emitPhpstanTypeAliases = true;
      }
      if (verbosePhpdoc) {
        entry.verbosePhpdoc = true;
      }
      out.push(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('skip', name, message);
    }
  }
  const fixturePath = path.resolve(testdataDir, `${name}.json`);
  writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${out.length} cases to ${fixturePath}`);
}

const errorsIn = path.join(testdataDir, 'errors.IN');
if (existsSync(errorsIn)) {
  const sources = readSources(errorsIn);
  const out = sources.map((input) => toErrorCase(input));
  const fixturePath = path.resolve(testdataDir, 'errors.json');
  writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${out.length} cases to ${fixturePath}`);
}
