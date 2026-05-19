/**
 * Regenerates generator fixture JSON from .IN source lists.
 * Run from repo root: yarn update_fixtures:generator
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateChecker } from '../index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testdataDir = __dirname;

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

const errorsIn = path.join(testdataDir, 'errors.IN');
if (existsSync(errorsIn)) {
  const sources = readSources(errorsIn);
  const out = sources.map((input) => ({ input }));
  const fixturePath = path.resolve(testdataDir, 'errors.json');
  writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${out.length} cases to ${fixturePath}`);
}
