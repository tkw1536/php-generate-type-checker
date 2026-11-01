/**
 * Enumerate examples-eligible `.IN` cases for `check-runtime.mjs`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseInSourceLine } from './readInSources.ts';

const TESTDATA_DIR = import.meta.dirname;

/** @typedef {{
 *   readonly stem: string;
 *   readonly input: string;
 *   readonly output: string;
 *   readonly emitPhpstanTypeAliases: boolean;
 *   readonly verbosePhpdoc: boolean;
 *   readonly sealArrayShapes: boolean;
 *   readonly requireClass: readonly string[];
 * }} RuntimeCase */

const DOCBlock_FIXTURES = [
  { name: 'docblock', emitPhpstanTypeAliases: false },
  { name: 'docblock_emit_aliases', emitPhpstanTypeAliases: true },
  { name: 'multi_comment', emitPhpstanTypeAliases: false },
  { name: 'verbose_phpdoc', emitPhpstanTypeAliases: false },
  { name: 'sealed_shapes', emitPhpstanTypeAliases: false },
];

/**
 * @param {string} inPath
 * @returns {import('./readInSources.ts').InSourceLine[]}
 */
function readSources(inPath) {
  /** @type {import('./readInSources.ts').InSourceLine[]} */
  const out = [];
  for (const line of readFileSync(inPath, 'utf8').split('\n')) {
    const parsed = parseInSourceLine(line);
    if (parsed !== null) {
      out.push(parsed);
    }
  }
  return out;
}

/**
 * @param {string} block
 * @returns {{
 *   readonly input: string;
 *   readonly output: string;
 *   readonly emitPhpstanTypeAliases: boolean;
 *   readonly verbosePhpdoc: boolean;
 *   readonly sealArrayShapes: boolean;
 *   readonly requireClass: readonly string[];
 * }}
 */
function parseMultilineCase(block) {
  const lines = block.split('\n');
  let output = 'function';
  let emitPhpstanTypeAliases = false;
  let verbosePhpdoc = false;
  let sealArrayShapes = false;
  /** @type {string[]} */
  let requireClass = [];
  let start = 0;

  while (start < lines.length && lines[start].startsWith('#')) {
    const line = lines[start].trim();
    const outputMatch = /^#\s*output:\s*(\S+)/u.exec(line);
    if (outputMatch) {
      output = outputMatch[1];
    }
    if (/^#\s*emitAliases:\s*1/u.test(line)) {
      emitPhpstanTypeAliases = true;
    }
    if (/^#\s*verbosePhpdoc:\s*1/u.test(line)) {
      verbosePhpdoc = true;
    }
    if (/^#\s*sealArrayShapes:\s*1/u.test(line)) {
      sealArrayShapes = true;
    }
    const requireMatch = /^#\s*RequireClass:\s*(.*)$/u.exec(line);
    if (requireMatch) {
      requireClass = requireMatch[1]
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
    }
    start++;
  }

  const input = lines.slice(start).join('\n').trim();
  return {
    input,
    output,
    emitPhpstanTypeAliases,
    verbosePhpdoc,
    sealArrayShapes,
    requireClass,
  };
}

/**
 * @param {string} inPath
 * @returns {ReturnType<typeof parseMultilineCase>[]}
 */
function readMultilineCases(inPath) {
  return readFileSync(inPath, 'utf8')
    .split('\n---\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => parseMultilineCase(block));
}

/**
 * @returns {RuntimeCase[]}
 */
function collectFunctionCases() {
  const functionIn = path.join(TESTDATA_DIR, 'function.IN');
  if (!existsSync(functionIn)) {
    throw new Error(`missing ${functionIn}`);
  }
  /** @type {RuntimeCase[]} */
  const cases = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const { input, requireClass } of readSources(functionIn)) {
    if (seen.has(input)) {
      continue;
    }
    seen.add(input);
    cases.push({
      stem: 'function',
      input,
      output: 'function',
      emitPhpstanTypeAliases: false,
      verbosePhpdoc: false,
      sealArrayShapes: false,
      requireClass,
    });
  }
  return cases;
}

/**
 * @param {string} name
 * @param {boolean} defaultEmit
 * @returns {RuntimeCase[]}
 */
function collectDocblockStemCases(name, defaultEmit) {
  const inPath = path.join(TESTDATA_DIR, `${name}.IN`);
  if (!existsSync(inPath)) {
    throw new Error(`missing ${inPath}`);
  }
  /** @type {RuntimeCase[]} */
  const cases = [];
  /** @type {Set<string>} */
  const seenInputs = new Set();
  for (const caseItem of readMultilineCases(inPath)) {
    // Match examples golden dedupe: one runtime pass per unique input.
    if (seenInputs.has(caseItem.input)) {
      continue;
    }
    seenInputs.add(caseItem.input);
    cases.push({
      stem: name,
      input: caseItem.input,
      output: caseItem.output,
      emitPhpstanTypeAliases: caseItem.emitPhpstanTypeAliases || defaultEmit,
      verbosePhpdoc: caseItem.verbosePhpdoc,
      sealArrayShapes: caseItem.sealArrayShapes,
      requireClass: caseItem.requireClass,
    });
  }
  return cases;
}

/**
 * @returns {RuntimeCase[]}
 */
export function collectRuntimeCases() {
  /** @type {RuntimeCase[]} */
  const cases = [...collectFunctionCases()];
  for (const { name, emitPhpstanTypeAliases } of DOCBlock_FIXTURES) {
    cases.push(...collectDocblockStemCases(name, emitPhpstanTypeAliases));
  }
  return cases;
}
