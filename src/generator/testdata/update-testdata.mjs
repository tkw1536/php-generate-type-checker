/**
 * Regenerates generator success `*.golden.php` (and `errors.json`) from `.IN` lists.
 * Run from repo root: yarn update_fixtures:generator
 *
 * Do not hand-edit `*.golden.php`; edit the matching `.IN` and regenerate.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateChecker } from '../index.ts';
import { namespaceIdForCase } from './goldenCase.ts';
import { formatGoldenPhp } from './goldenPhp.ts';

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
 *   readonly sealArrayShapes: boolean;
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
    const sealMatch = /^#\s*sealArrayShapes:\s*1/u.exec(line);
    if (sealMatch) {
      sealArrayShapes = true;
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
  };
}

/**
 * @param {string} input
 * @returns {{ input: string }}
 */
function toErrorCase(input) {
  return { input };
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
 * @param {import('./goldenCase.ts').GoldenCaseMeta} meta
 * @param {string} label
 */
function registerNamespace(meta, label) {
  const id = namespaceIdForCase(meta);
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
 * @param {string} stem
 * @param {readonly { readonly meta: import('./goldenCase.ts').GoldenCaseMeta; readonly expected: string }[]} cases
 */
function writeGoldenPhp(stem, cases) {
  for (const item of cases) {
    registerNamespace(
      item.meta,
      `${stem}: ${JSON.stringify(item.meta.input)}`,
    );
  }
  const fixturePath = path.resolve(testdataDir, `${stem}.golden.php`);
  const source = formatGoldenPhp(stem, cases);
  writeFileSync(fixturePath, source);
  const written = (source.match(/^\/\/ @gtc-golden-begin /gmu) ?? []).length;
  console.log(`Wrote ${written} cases to ${fixturePath}`);
}

for (const output of OUTPUT_MODES) {
  const inPath = path.join(testdataDir, `${output}.IN`);
  if (!existsSync(inPath)) {
    continue;
  }
  const sources = readSources(inPath);
  /** @type {{ meta: import('./goldenCase.ts').GoldenCaseMeta; expected: string }[]} */
  const out = [];
  for (const input of sources) {
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
  writeGoldenPhp(output, out);
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
  for (const {
    input,
    output,
    emitPhpstanTypeAliases,
    verbosePhpdoc,
    sealArrayShapes,
  } of cases) {
    const emit = emitPhpstanTypeAliases || defaultEmit;
    try {
      const expected = generateChecker(input, {
        output,
        emitPhpstanTypeAliases: emit,
        verbosePhpdoc,
        sealArrayShapes,
      });
      out.push({
        meta: sparseMeta({
          input,
          output,
          ...(emit ? { emitPhpstanTypeAliases: true } : {}),
          ...(verbosePhpdoc ? { verbosePhpdoc: true } : {}),
          ...(sealArrayShapes ? { sealArrayShapes: true } : {}),
        }),
        expected,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('skip', name, message);
    }
  }
  writeGoldenPhp(name, out);
}

const errorsIn = path.join(testdataDir, 'errors.IN');
if (existsSync(errorsIn)) {
  const sources = readSources(errorsIn);
  const out = sources.map((input) => toErrorCase(input));
  const fixturePath = path.resolve(testdataDir, 'errors.json');
  writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${out.length} cases to ${fixturePath}`);
}
