# PHPStan Type Checker Generator

Parse [PHPStan PHPDoc types](https://phpstan.org/writing-php-code/phpdoc-types) and generate PHP 8+ runtime checker methods.

> **Disclaimer:** This project is vibe-coded — built quickly with minimal review. Use it at your own risk; always check any outputted code for correctness yourself. 

## Commands

```bash
corepack enable   # once per machine, if Yarn is not available
yarn install
yarn dev          # web UI at http://localhost:5173
yarn test         # vitest
yarn build
```

## Web UI

The UI uses **tabs** (Generate PHP / Parse AST) with input on the left and highlighted output on the right. A **theme toggle** in the header follows your system preference until you override it; syntax highlighting uses GitHub (light) and GitHub Dark themes.

## Where to extend code generation

- **Simple types** (primitives, aliases, classes): [`src/generator/simpleTypes.ts`](src/generator/simpleTypes.ts) — adjust `emitExpression()`.
- **Recursive / composite types** (arrays, shapes, unions): [`src/generator/emit.ts`](src/generator/emit.ts) — `emitFunctionBody()`, `emitExpression()`, `emitStatementBlock()`.
- **Checkability rules** (what cannot be generated): [`src/generator/checkability.ts`](src/generator/checkability.ts).
- **Method wrapper** (`checkType`, docblock): [`src/generator/php.ts`](src/generator/php.ts).

Types that cannot be checked at runtime (e.g. `callable(int): string`, `Collection<T>`) throw `GenerationError`.

## API

```ts
import { parseType, generateChecker, GenerationError } from './src/index.ts';

const ast = parseType('array<string, int>');
const php = generateChecker('array<string, int>');
// throws GenerationError for uncheckable types
```

## Parser

Hand-written lexer + recursive-descent parser in [`src/parser/`](src/parser/). Fixture tests live in [`src/__tests__/fixtures/parser/`](src/__tests__/fixtures/parser/) and run via [`src/__tests__/parser.test.ts`](src/__tests__/parser.test.ts).
