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

## Inspecting generated checkers

Generated validation logic uses a small **checker IR** pipeline:

1. Parse + checkability ([`checkability.ts`](src/generator/checkability.ts))
2. [`buildCheckerIR.ts`](src/generator/buildCheckerIR.ts) — mechanical AST → IR (atomic `call` / `equals` checks)
3. **[`normalizeCheckerIR.ts`](src/generator/normalizeCheckerIR.ts)** (`optimizeCheckerIR`) — dedupe guards, hoist `failIf` before loops
4. **[`emitCheckerIR.ts`](src/generator/emitCheckerIR.ts)** — IR → PHP (`if` batching, `foreach`, optional blocks)
5. Wrap in [`php.ts`](src/generator/php.ts)

**Start here** when reading or changing how guards are combined or emitted: `normalizeCheckerIR.ts` (`optimizeCheckerIR`) and `emitCheckerIR.ts`.

IR checks are only:

- `{ kind: 'call', function, arguments, negated }` — e.g. `is_array`, `array_key_exists`, **`instanceof`**
- `{ kind: 'equals', variable, literal, negated }` — e.g. `$value === []`

PHPStan primitives are expanded in [`checksFromType.ts`](src/generator/checksFromType.ts). Atoms are rendered in [`renderCheck.ts`](src/generator/renderCheck.ts).

```ts
import {
  buildCheckerIR,
  optimizeCheckerIR,
  emitCheckerIR,
  formatCheckerProgram,
} from './src/generator/index.ts';
```

### `prioritizeReadabilityOverCompactness` option

On `GenerateCheckerOptions`, the default (`false`) merges consecutive failure guards into one `if (!a || !b || …)` and hoists guards before loops for batching. When `true`, emits one `if` per guard **in builder order** (no hoisting/reordering). The web UI labels this **Prioritize readability over compactness**.

## Where to extend

- **New primitive / leaf type checks:** [`checksFromType.ts`](src/generator/checksFromType.ts) and [`simpleTypes.ts`](src/generator/simpleTypes.ts)
- **Guard combining / ordering / dedupe:** [`normalizeCheckerIR.ts`](src/generator/normalizeCheckerIR.ts) (`optimizeCheckerIR`)
- **PHP shape (`if` vs combined, foreach, optional):** [`emitCheckerIR.ts`](src/generator/emitCheckerIR.ts)
- **Checkability rules:** [`checkability.ts`](src/generator/checkability.ts)
- **Method wrapper:** [`php.ts`](src/generator/php.ts)

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
