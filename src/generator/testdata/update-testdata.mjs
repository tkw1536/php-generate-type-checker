/**
 * Regenerates generator fixture JSON from .IN source lists.
 * Run from repo root: yarn update_fixtures:generator
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateChecker, generateDocblockChecker } from '../index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const testdataDir = here;

const OUTPUT_MODES = [
  'function',
  'public_static',
  'protected_static',
  'private_static',
];

function readSources(inPath) {
  return readFileSync(inPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function readMultilineCases(inPath) {
  return readFileSync(inPath, 'utf8')
    .split('\n---\n')
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map(parseMultilineCase);
}

function parseMultilineCase(block) {
  const lines = block.split('\n');
  const options = { output: 'function', emitPhpstanTypeAliases: false };
  let start = 0;

  while (start < lines.length && lines[start].startsWith('#')) {
    const line = lines[start].trim();
    const outputMatch = /^#\s*output:\s*(\S+)/.exec(line);
    if (outputMatch) {
      options.output = outputMatch[1];
    }
    const emitMatch = /^#\s*emitAliases:\s*1/.exec(line);
    if (emitMatch) {
      options.emitPhpstanTypeAliases = true;
    }
    start++;
  }

  const input = lines.slice(start).join('\n').trim();
  return { input, ...options };
}

for (const output of OUTPUT_MODES) {
  const inPath = path.join(testdataDir, `${output}.IN`);
  if (!existsSync(inPath)) continue;
  const sources = readSources(inPath);
  const out = [];
  for (const input of sources) {
    try {
      const expected = generateChecker(input, { output });
      out.push({ input, expected });
    } catch (err) {
      console.warn('skip', output, JSON.stringify(input), err?.message ?? err);
    }
  }
  const fixturePath = path.resolve(testdataDir, `${output}.json`);
  writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${out.length} cases to ${fixturePath}`);
}

const DOCBlock_FIXTURES = [
  { name: 'docblock', emitPhpstanTypeAliases: false },
  { name: 'docblock_emit_aliases', emitPhpstanTypeAliases: true },
];

for (const { name, emitPhpstanTypeAliases: defaultEmit } of DOCBlock_FIXTURES) {
  const inPath = path.join(testdataDir, `${name}.IN`);
  if (!existsSync(inPath)) continue;
  const cases = readMultilineCases(inPath);
  const out = [];
  for (const { input, output, emitPhpstanTypeAliases } of cases) {
    const emit =
      emitPhpstanTypeAliases !== undefined
        ? emitPhpstanTypeAliases
        : defaultEmit;
    try {
      const expected = generateDocblockChecker(input, {
        output,
        emitPhpstanTypeAliases: emit,
      });
      const entry = { input, output, expected };
      if (emit) {
        entry.emitPhpstanTypeAliases = true;
      }
      out.push(entry);
    } catch (err) {
      console.warn('skip', name, err?.message ?? err);
    }
  }
  const fixturePath = path.resolve(testdataDir, `${name}.json`);
  writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${out.length} cases to ${fixturePath}`);
}

const errorsIn = path.join(testdataDir, 'errors.IN');
if (existsSync(errorsIn)) {
  const sources = readSources(errorsIn);
  const out = sources.map((input) => ({ input }));
  const fixturePath = path.resolve(testdataDir, 'errors.json');
  writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${out.length} cases to ${fixturePath}`);
}
