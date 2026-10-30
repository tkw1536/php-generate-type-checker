/**
 * Regenerates generator success `*.checker.golden.php` and `*.examples.golden.php`
 * from `.IN` lists.
 * Run from repo root: yarn update_fixtures:generator
 *
 * Do not hand-edit goldens; edit the matching `.IN` and regenerate.
 * Error cases live in `errors.IN` only (no regenerate step).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateChecker } from '../index.ts';
import { namespaceIdForCase } from './goldenCase.ts';
import { formatGoldenPhp } from './goldenPhp.ts';
import { parseInSourceLine } from './readInSources.ts';
import {
  buildExamplesCase,
  writeExamplesFromSources,
  writeExamplesGoldenPhp,
} from './update-testdata.examples.mjs';

const testdataDir = import.meta.dirname;

/** @type {readonly string[]} */
const OUTPUT_MODES = [
  'function',
  'public_static',
  'protected_static',
];

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
 * @typedef {{
 *   readonly input: string;
 *   readonly output: string;
 *   readonly emitPhpstanTypeAliases: boolean;
 *   readonly verbosePhpdoc: boolean;
 *   readonly sealArrayShapes: boolean;
 *   readonly requireClass: readonly string[];
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
 * @param {import('./goldenCase.ts').GoldenCaseMeta} meta
 * @returns {import('./goldenCase.ts').GoldenCaseMeta}
 */
function sparseMeta(meta) {
  return {
    input: meta.input,
    output: meta.output,
    ...(meta.emitPhpstanTypeAliases === true
      ? { emitPhpstanTypeAliases: true }
      : {}),
    ...(meta.verbosePhpdoc === true ? { verbosePhpdoc: true } : {}),
    ...(meta.sealArrayShapes === true ? { sealArrayShapes: true } : {}),
  };
}

/** @type {Map<string, string>} */
const globalNamespaces = new Map();

/**
 * @param {string} id
 * @param {string} label
 */
function registerNamespaceId(id, label) {
  const prev = globalNamespaces.get(id);
  if (prev !== undefined && prev !== label) {
    throw new Error(
      `namespace collision Golden\\${id} across suites: ${prev} vs ${label}`,
    );
  }
  if (prev === undefined) {
    globalNamespaces.set(id, label);
  }
}

/**
 * @param {import('./goldenCase.ts').GoldenCaseMeta} meta
 * @param {string} label
 */
function registerNamespace(meta, label) {
  registerNamespaceId(namespaceIdForCase(meta), label);
}

/**
 * @param {string} stem
 * @param {readonly { readonly meta: import('./goldenCase.ts').GoldenCaseMeta; readonly expected: string }[]} cases
 */
function writeCheckerGoldenPhp(stem, cases) {
  for (const item of cases) {
    registerNamespace(
      item.meta,
      `${stem}: ${JSON.stringify(item.meta.input)}`,
    );
  }
  const fixturePath = path.resolve(testdataDir, `${stem}.checker.golden.php`);
  const source = formatGoldenPhp(stem, cases);
  writeFileSync(fixturePath, source);
  const written = (source.match(/^\/\/ @gtc-golden-begin /gmu) ?? []).length;
  console.log(`Wrote ${written} checker cases to ${fixturePath}`);
}

for (const output of OUTPUT_MODES) {
  const inPath = path.join(testdataDir, `${output}.IN`);
  if (!existsSync(inPath)) {
    continue;
  }
  const sources = readSources(inPath);
  /** @type {{ meta: import('./goldenCase.ts').GoldenCaseMeta; expected: string }[]} */
  const out = [];
  for (const { input } of sources) {
    try {
      const expected = generateChecker(input, { output });
      out.push({
        meta: sparseMeta({ input, output }),
        expected,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('skip', output, JSON.stringify(input), message);
    }
  }
  writeCheckerGoldenPhp(output, out);
  if (output === 'function') {
    writeExamplesFromSources(
      testdataDir,
      registerNamespaceId,
      output,
      sources,
    );
  }
}

const DOCBlock_FIXTURES = [
  { name: 'docblock', emitPhpstanTypeAliases: false },
  { name: 'docblock_emit_aliases', emitPhpstanTypeAliases: true },
  { name: 'multi_comment', emitPhpstanTypeAliases: false },
  { name: 'verbose_phpdoc', emitPhpstanTypeAliases: false },
  { name: 'sealed_shapes', emitPhpstanTypeAliases: false },
];

for (const { name, emitPhpstanTypeAliases: defaultEmit } of DOCBlock_FIXTURES) {
  const inPath = path.join(testdataDir, `${name}.IN`);
  if (!existsSync(inPath)) {
    continue;
  }
  const cases = readMultilineCases(inPath);
  /** @type {{ meta: import('./goldenCase.ts').GoldenCaseMeta; expected: string }[]} */
  const out = [];
  /** @type {{ meta: import('./examplesGolden.ts').ExamplesGoldenMeta; expected: string }[]} */
  const examplesOut = [];
  const examplesSeen = new Set();
  for (const caseItem of cases) {
    const emit = caseItem.emitPhpstanTypeAliases || defaultEmit;
    try {
      const expected = generateChecker(caseItem.input, {
        output: caseItem.output,
        emitPhpstanTypeAliases: emit,
        verbosePhpdoc: caseItem.verbosePhpdoc,
        sealArrayShapes: caseItem.sealArrayShapes,
      });
      out.push({
        meta: sparseMeta({
          input: caseItem.input,
          output: caseItem.output,
          ...(emit ? { emitPhpstanTypeAliases: true } : {}),
          ...(caseItem.verbosePhpdoc ? { verbosePhpdoc: true } : {}),
          ...(caseItem.sealArrayShapes ? { sealArrayShapes: true } : {}),
        }),
        expected,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('skip', name, message);
    }
    if (!examplesSeen.has(caseItem.input)) {
      examplesSeen.add(caseItem.input);
      const item = buildExamplesCase(
        name,
        caseItem.input,
        caseItem.requireClass,
      );
      if (item !== null) {
        examplesOut.push(item);
      }
    }
  }
  writeCheckerGoldenPhp(name, out);
  writeExamplesGoldenPhp(
    testdataDir,
    registerNamespaceId,
    name,
    examplesOut,
  );
}
