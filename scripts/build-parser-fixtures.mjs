/**
 * One-off helper: writes parser fixture files from parseType() output.
 * Run: node scripts/build-parser-fixtures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseType } from '../src/parser/index.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../src/__tests__/fixtures/parser');

const successCases = {
  'primitive-int': 'int',
  'primitive-string': 'string',
  'primitive-float': 'float',
  'primitive-bool': 'bool',
  'primitive-null': 'null',
  'primitive-mixed': 'mixed',
  'primitive-array': 'array',
  'primitive-object': 'object',
  'primitive-callable': 'callable',
  'primitive-true': 'true',
  'primitive-false': 'false',
  'alias-positive-int': 'positive-int',
  'alias-non-empty-string': 'non-empty-string',
  'alias-class-string': 'class-string',
  'array-key-value': 'array<string, int>',
  'array-value-only': 'array<int>',
  'postfix-string-array': 'string[]',
  'postfix-nested': 'string[][]',
  'shape-required-optional': 'array{foo: int, bar?: string}',
  'shape-quoted-key': 'array{"field-one": int}',
  'shape-numeric-key': 'array{0: int, 1?: string}',
  'union-three': 'int|string|null',
  'union-parenthesized': '(int|string)',
  'intersection-two': 'Foo&Bar',
  'precedence-intersection-union': 'A&B|C',
  'generic-array-two': 'array<int, Foo>',
  'generic-list': 'list<int>',
  'generic-non-empty-array': 'non-empty-array<string>',
  'generic-iterable-one': 'iterable<string>',
  'generic-iterable-two': 'iterable<int, string>',
  'nested-array': 'array<string, array<int, bool>>',
  'list-tuple-shape': 'list{int, string}',
  'class-fqn': '\\Foo\\Bar',
  'class-simple': 'DateTimeInterface',
  'literal-string-union': "'foo'|'bar'",
  'literal-int': '42',
  'callable-simple': 'callable(int, int): string',
  'callable-void-return': 'callable(): void',
  'callable-named-params': 'callable(int $a, string $b): bool',
  'callable-by-ref': 'callable(string &$x): void',
  'callable-variadic': 'callable(int ...$rest): void',
  'union-with-array': 'int|array<string, bool>',
  'intersection-three': 'A&B&C',
  'complex-nested': '(array<string, int|null>|null)&Foo',
  'array-shape-single': 'array{count: positive-int}',
  'list-single-arg': 'non-empty-list<string>',
};

const errorCases = {
  'error-unclosed-generic': { input: 'array<string', error: 'parse' },
  'error-trailing-garbage': { input: 'int extra', error: 'parse' },
  'error-empty': { input: '', error: 'parse' },
  'error-unclosed-string': { input: "'foo", error: 'lexer' },
};

function formatFixture(input, ast, { error } = {}) {
  const lines = ['---', `input: ${JSON.stringify(input)}`];
  if (error) {
    lines.push(`error: ${error}`);
  }
  lines.push('---', '// json');
  if (!error) {
    lines.push(JSON.stringify(ast, null, 2));
  }
  lines.push('');
  return lines.join('\n');
}

fs.mkdirSync(outDir, { recursive: true });

for (const [name, input] of Object.entries(successCases)) {
  try {
    const ast = parseType(input);
    fs.writeFileSync(
      path.join(outDir, `${name}.fixture`),
      formatFixture(input, ast),
      'utf8',
    );
  } catch (err) {
    console.error(`Skipped ${name}: ${err.message}`);
  }
}

for (const [name, { input, error }] of Object.entries(errorCases)) {
  fs.writeFileSync(
    path.join(outDir, `${name}.fixture`),
    formatFixture(input, null, { error }),
    'utf8',
  );
}

console.log(`Wrote ${Object.keys(successCases).length + Object.keys(errorCases).length} fixtures to ${outDir}`);
