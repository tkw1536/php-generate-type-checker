import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { generateChecker } from '../src/generator/index.ts';

const dir = new URL('../src/support/fixtures/generator/', import.meta.url);
for (const name of readdirSync(dir)) {
  if (!name.endsWith('.fixture') || name.includes('error')) continue;
  const path = new URL(name, dir);
  const content = readFileSync(path, 'utf8');
  const m = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) continue;
  const meta = Object.fromEntries(
    m[1].split('\n').map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i), line.slice(i + 1).trim()];
    }),
  );
  let input = meta.input ?? '';
  if (input.startsWith('"') && input.endsWith('"')) {
    input = JSON.parse(input);
  } else if (input.startsWith("'") && input.endsWith("'")) {
    input = input.slice(1, -1);
  }
  const output = meta.output ?? 'function';
  try {
    const php = generateChecker(input, { output });
    const quoted = JSON.stringify(input);
    writeFileSync(path, `---\ninput: ${quoted}\noutput: ${output}\n---\n${php}`);
    console.log('updated', name);
  } catch (err) {
    console.warn('skip', name, err?.message ?? err);
  }
}
