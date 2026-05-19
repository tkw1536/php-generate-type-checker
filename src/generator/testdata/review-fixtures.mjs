import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(dir, 'review-state.json');

function loadFixtures() {
  const fixtures = [];
  for (const mode of ['function', 'public_static', 'protected_static', 'private_static']) {
    const file = path.join(dir, `${mode}.json`);
    if (!existsSync(file)) continue;
    for (const { input, expected } of JSON.parse(readFileSync(file, 'utf8'))) {
      fixtures.push({
        name: mode === 'function' ? input : `${mode}: ${input}`,
        input,
        output: mode,
        expected,
        expectsError: false,
      });
    }
  }
  const errorsFile = path.join(dir, 'errors.json');
  if (existsSync(errorsFile)) {
    for (const { input } of JSON.parse(readFileSync(errorsFile, 'utf8'))) {
      fixtures.push({
        name: `error: ${input}`,
        input,
        output: 'function',
        expected: '',
        expectsError: true,
      });
    }
  }
  return fixtures.sort((a, b) => a.name.localeCompare(b.name));
}

function loadState() {
  if (!existsSync(statePath)) return { good: [], bad: [] };
  return JSON.parse(readFileSync(statePath, 'utf8'));
}

function saveState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function askKey(prompt) {
  return new Promise((resolve) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (key) => {
      if (key === '\u0003') process.exit();
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

for (const f of pending) {
  console.log('\n---');
  console.log(JSON.stringify({
    'input': f.input,
    'error': f.expectsError,
  }, null, 2));
  console.log('--- expected ---');
  console.log(f.expected.trim());
  console.log('--- end ---\n');

  const ch = await askKey('Look good [y/n/e]? ');
  if (ch === 'e') {
    bail = true;
    saveState(state);
    break;
  }
  if (ch === 'y') state.good.push(f.name);
  else state.bad.push(f.name);
  saveState(state);
}

console.log(bail ? '\n=== stopped early ===' : '\n=== done ===');
console.log('good:', state.good.length);
console.log('bad:', state.bad.length);
saveState(state);
console.log(`Wrote ${statePath}`);
