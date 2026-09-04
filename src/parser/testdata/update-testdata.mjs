import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseType } from '../index.ts';

const here = import.meta.dirname;
const inputPath = path.join(here, 'parser.success.IN');
const fixturePath = path.join(here, 'parser.success.json');

const sources = readFileSync(inputPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'));

const out = sources.map((source) => ({
  source,
  ast: parseType(source),
}));

writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${out.length} cases to ${fixturePath}`);
