import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseType } from '../index.ts';

const here = import.meta.dirname;
const inputPath = path.join(here, 'parser.success.IN');
const fixturePath = path.join(here, 'parser.success.json');

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
 * @param {string} source
 * @returns {{ source: string; ast: ReturnType<typeof parseType> }}
 */
function toSuccessCase(source) {
  return {
    source,
    ast: parseType(source),
  };
}

const sources = readFileSync(inputPath, 'utf8')
  .split('\n')
  .map((line) => trimLine(line))
  .filter((line) => isSourceLine(line));

const out = sources.map((source) => toSuccessCase(source));

writeFileSync(fixturePath, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${out.length} cases to ${fixturePath}`);
