import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stdin, stdout } from 'node:process';
import { SUCCESS_GOLDEN_STEMS } from './goldenCase.ts';
import { parseGoldenPhp } from './goldenPhp.ts';

/**
 * @typedef {{
 *   readonly name: string;
 *   readonly input: string;
 *   readonly output: string;
 *   readonly expected: string;
 *   readonly expectsError: boolean;
 * }} Fixture
 */

/**
 * @typedef {{
 *   good: string[];
 *   bad: string[];
 * }} ReviewState
 */

/**
 * @typedef {{ readonly input: string }} ErrorFixtureJson
 */

const dir = import.meta.dirname;
const statePath = path.join(dir, 'review-state.json');

const MODE_STEMS = new Set([
  'function',
  'public_static',
  'protected_static',
  'private_static',
]);

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(text) {
  return structuredClone(JSON.parse(text));
}

/**
 * @param {unknown} value
 * @returns {value is ErrorFixtureJson}
 */
function isErrorFixtureJson(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'input' in value &&
    typeof value.input === 'string'
  );
}

/**
 * @param {unknown} value
 * @returns {value is ReviewState}
 */
function isReviewState(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    'good' in value &&
    'bad' in value &&
    Array.isArray(value.good) &&
    Array.isArray(value.bad) &&
    value.good.every((item) => typeof item === 'string') &&
    value.bad.every((item) => typeof item === 'string')
  );
}

/**
 * @param {string} file
 * @returns {ErrorFixtureJson[]}
 */
function readErrorFixtures(file) {
  const data = parseJson(readFileSync(file, 'utf8'));
  if (!Array.isArray(data) || !data.every((item) => isErrorFixtureJson(item))) {
    throw new Error(`invalid error fixtures: ${file}`);
  }
  return data;
}

/**
 * @param {readonly Fixture[]} items
 * @returns {Fixture[]}
 */
function sortedByName(items) {
  /** @type {Fixture[]} */
  const result = [];
  for (const item of items) {
    let insertAt = result.length;
    for (let i = 0; i < result.length; i++) {
      if (item.name.localeCompare(result[i].name) < 0) {
        insertAt = i;
        break;
      }
    }
    result.splice(insertAt, 0, item);
  }
  return result;
}

/**
 * @param {string} stem
 * @param {import('./goldenCase.ts').GoldenCaseMeta} meta
 * @returns {string}
 */
function modeFixtureName(stem, meta) {
  return meta.output === 'function'
    ? meta.input
    : `${meta.output}: ${meta.input}`;
}

/** @returns {Fixture[]} */
function loadFixtures() {
  /** @type {Fixture[]} */
  const fixtures = [];
  for (const stem of SUCCESS_GOLDEN_STEMS) {
    if (!MODE_STEMS.has(stem)) {
      continue;
    }
    const file = path.join(dir, `${stem}.golden.php`);
    if (!existsSync(file)) {
      continue;
    }
    for (const item of parseGoldenPhp(readFileSync(file, 'utf8'))) {
      fixtures.push({
        name: modeFixtureName(stem, item.meta),
        input: item.meta.input,
        output: item.meta.output,
        expected: item.expected,
        expectsError: false,
      });
    }
  }
  const errorsFile = path.join(dir, 'errors.json');
  if (existsSync(errorsFile)) {
    for (const { input } of readErrorFixtures(errorsFile)) {
      fixtures.push({
        name: `error: ${input}`,
        input,
        output: 'function',
        expected: '',
        expectsError: true,
      });
    }
  }
  return sortedByName(fixtures);
}

/** @returns {ReviewState} */
function loadState() {
  if (!existsSync(statePath)) {
    return { good: [], bad: [] };
  }
  const data = parseJson(readFileSync(statePath, 'utf8'));
  if (!isReviewState(data)) {
    throw new Error(`invalid review state: ${statePath}`);
  }
  return data;
}

/**
 * @param {{ readonly good: readonly string[]; readonly bad: readonly string[] }} state
 */
function saveState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

/**
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function askKey(prompt) {
  return new Promise((resolve) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    /** @param {string} key */
    const onData = (key) => {
      if (key === '\u0003') {
        process.exit();
      }
      const ch = key.toLowerCase();
      if (ch === 'y' || ch === 'n' || ch === 'e') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write(`${ch}\n`);
        resolve(ch);
      }
    };
    stdin.on('data', onData);
  });
}

if (!stdin.isTTY) {
  console.error('review-fixtures needs an interactive terminal (TTY).');
  process.exit(1);
}

const fixtures = loadFixtures();
const state = loadState();
const done = new Set([...state.good, ...state.bad]);
const pending = fixtures.filter((f) => !done.has(f.name));

let bail = false;

/**
 * @param {number} index
 * @returns {Promise<void>}
 */
async function reviewRemaining(index) {
  if (index >= pending.length) {
    return;
  }
  const f = pending[index];
  console.log('\n---');
  console.log(
    JSON.stringify(
      {
        input: f.input,
        error: f.expectsError,
      },
      null,
      2,
    ),
  );
  console.log('--- expected ---');
  console.log(f.expected.trim());
  console.log('--- end ---\n');

  const ch = await askKey('Look good [y/n/e]? ');
  if (ch === 'e') {
    bail = true;
    saveState(state);
    return;
  }
  if (ch === 'y') {
    state.good.push(f.name);
  } else {
    state.bad.push(f.name);
  }
  saveState(state);
  await reviewRemaining(index + 1);
}

await reviewRemaining(0);

console.log(bail ? '\n=== stopped early ===' : '\n=== done ===');
console.log('good:', state.good.length);
console.log('bad:', state.bad.length);
saveState(state);
console.log(`Wrote ${statePath}`);
