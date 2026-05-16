# PHP Type Checker Generator

Parse [PHPDoc types as supported by PHPStan](https://phpstan.org/writing-php-code/phpdoc-types) and generate PHP 8+ runtime checker code with `@phpstan-assert-if-true` annotations.

> **Disclaimer:** This project is vibe-coded — built quickly with minimal review. Use it at your own risk; always check any outputted code for correctness yourself.

## Features

- **Type parser** — lexer and recursive-descent parser for PHPDoc-style types (primitives, unions, intersections, shapes, generics, callables, int ranges, and common aliases).
- **Runtime checkers** — emits `bool` functions (or class methods) that validate `mixed $value` against a type string.
- **Checker IR pipeline** — `build` → `optimize` → `render`, with JSON IR tabs in the UI for debugging.
- **Deduped checker functions** — nested or repeated types share one function per canonical type (e.g. `array<int>` inside a shape and inside a union).
- **Output shapes** — standalone `function`, or `public` / `protected` / `private` `static` methods on a `TypeChecker` class.
- **Naming** — default `is{TypeSlug}` entry and helper names from the type AST; optional legacy `check` / `check_N`.
- **Layout** — compact combined guards (default) or readable one-`if`-per-guard mode (**Readable layout** skips the optimizer).
- **Web UI** — type input, example presets, generate options, and tabbed pipeline output with syntax highlighting and light/dark theme.

Types that cannot be checked at runtime (e.g. most `callable` signatures, unsupported generics, `literal-string`) fail with `GenerationError`.

## Commands

```bash
corepack enable   # once per machine, if Yarn is not available
yarn install
yarn dev          # web UI at http://localhost:5173
yarn test         # vitest
yarn build        # tsc + production bundle
yarn spellcheck   # cspell
```

Helper scripts (optional):

- `node scripts/build-parser-fixtures.mjs` — regenerate parser fixture JSON bodies
- `node scripts/refresh-generator-fixtures.mjs` — refresh generator fixture expected PHP

## Web UI

Single workspace: **type input** on the left, **pipeline output** on the right. Output refreshes automatically when the type or options change (debounced).

**Generate options** (footer of the input panel):

| Control | Effect |
|--------|--------|
| **Name from type** | `is{TypeSlug}` names (on) vs legacy `check` / `check_N` (off) |
| **Readable layout** | Skip optimizer; PHP from **IR (build)** (on) vs compact **IR (optimized)** (off) |
| **Emit as** | Standalone function, or `public` / `protected` / `private` static method on `TypeChecker` |

**Output tabs** (left → right):

1. **Type AST** — parsed JSON AST
2. **IR (build)** — checker IR from `builder/index.ts` (`IRBuilder`)
3. **IR (optimized)** — IR after optimizer passes (or a note when readable layout is on)
4. **PHP Code** — final generated PHP

The header **theme toggle** (☾ / ☀) follows the system preference until you override it. Highlight.js uses GitHub (light) and GitHub Dark themes.

## Code structure

```
src/
├── index.ts                 # public API (parseType, build, optimize, render, …)
├── main.ts                  # Vite app bootstrap
├── theme.ts, style.css
├── parser/                  # PHPDoc type → AST
│   ├── parser.ts, lexer.ts, ast.ts
│   └── parseType.test.ts
├── generator/               # AST → PHP checkers
│   ├── pipeline.ts          # build(), optimize(), renderChecker()
│   ├── ir/                  # CheckerIR, Expr, Stmt, ValueRef, helpers
│   ├── semantics/           # TypeNode: normalize, keys, expressibility, union order
│   ├── builder/             # TypeNode → Checker IR
│   │   ├── index.ts           # IRBuilder
│   │   ├── leafIr.ts          # leaf type → Expr IR
│   │   ├── primitive.ts
│   │   ├── proposer.ts
│   │   └── registry.ts
│   ├── optimizer/           # IR compaction (dedupe, merge failIf, hoist, fold)
│   │   └── IROptimizer.ts
│   ├── render/              # IR → PHP bodies + output wrapper
│   │   ├── renderPhp.ts     # pure function-body rendering
│   │   ├── phpdoc.ts        # PHPStan type strings for @phpstan-assert
│   │   └── IRRenderer.ts
│   ├── checkability.ts
│   ├── php.ts               # @phpstan-assert-if-true wrappers, class layout
│   ├── generateChecker.test.ts
│   └── index.ts             # generateChecker() composes the pipeline
├── support/                 # tests only (fixtures + loaders)
│   ├── fixtureFormat.ts
│   ├── loadParserFixture.ts, loadGeneratorFixture.ts
│   └── fixtures/{parser,generator}/
└── ui/                      # error display, examples
```

Production code does not import `src/support/`.

## Generation pipeline

End-to-end flow for `generateChecker(typeString)`:

1. **Parse** — `parseType` → `TypeNode` ([`src/parser/`](src/parser/))
2. **Normalize & check** — [`semantics/`](src/generator/semantics/), [`checkability.ts`](src/generator/checkability.ts)
3. **Build** — [`build()`](src/generator/pipeline.ts) walks the AST via [`IRBuilder`](src/generator/builder/index.ts); names helpers via [`FunctionNameRegistry`](src/generator/builder/registry.ts)
4. **Optimize** — [`optimize()`](src/generator/optimizer/IROptimizer.ts) unless `prioritizeReadabilityOverCompactness` is true
5. **Render** — [`render()`](src/generator/render/IRRenderer.ts) turns IR into PHP (body via [`renderPhp.ts`](src/generator/render/renderPhp.ts), then [`php.ts`](src/generator/php.ts) wraps with PHPDoc / class)

### Checker IR (outline)

`CheckerIR` is `{ programs: Record<string, CheckerProgram>; order: string[] }`.

Each **`CheckerProgram`** has a parameter name and a **`Block`** (`Stmt[]`):

| Stmt | Role |
|------|------|
| `if` | Condition + body (fail-if uses `if (!guard) { return false; }`, optional shape fields use positive `if (exists) { … }`) |
| `foreach` | Loop with nested body |
| `return` | Boolean expression or `true` / `false` |

**`Expr`** kinds include `bool`, `not`, `and`, `or`, `call`, `bin`, `instanceof`, `call_checker` (helper reference). **`ValueRef`** models `$value`, `$value['key']`, `$value->prop`.

**Optimizer** passes: dedupe identical fail-if, merge consecutive fail-if into one guard, hoist fail-if before loops, fold trailing fail-if + `return true` into `return` of combined guards, light boolean cleanup.

**Renderer**: fail-if conditions with `not (a && b)` emit as `!a || !b` chains; output mode (function vs `self::` static) lives only in `IRRenderer`.

## Programmatic API

```ts
import {
  parseType,
  build,
  optimize,
  render,
  normalizeNode,
  assertCheckable,
  GenerationError,
} from './src/index.ts';

const ast = normalizeNode(parseType('array<string, int>'));
assertCheckable(ast, 'function');

const { ir: built, typesByName } = build(ast, { nameFunctionsByType: true });
const ir = optimize(built);
const php = render(ir, {
  typeString: 'array<string, int>',
  typesByName,
  output: 'function',
});
```

Convenience wrapper (used by tests and the refresh script):

```ts
import { generateChecker } from './src/generator/index.ts';

const php = generateChecker('list<int>', {
  output: 'function',
  prioritizeReadabilityOverCompactness: false,
});
```

### Options reference

| Option | Default | Meaning |
|--------|---------|---------|
| `output` | `'function'` | Standalone function or class static method visibility |
| `nameFunctionsByType` | `true` | `is{TypeSlug}` vs `check` / `check_N` |
| `mainFunctionName` | derived from type | Entry function/method name |
| `prioritizeReadabilityOverCompactness` | `false` | When true, skip optimizer and render built IR |

## Tests

- **Unit / integration** — `*.test.ts` next to the module they cover (`src/parser/`, `src/generator/**/`, `src/ui/`).
- **Fixtures** — YAML frontmatter + body under [`src/support/fixtures/`](src/support/fixtures/); loaded by [`loadParserFixture.ts`](src/support/loadParserFixture.ts) and [`loadGeneratorFixture.ts`](src/support/loadGeneratorFixture.ts).

Run `yarn test` (Vitest).

## Where to extend

| Goal | Start here |
|------|------------|
| New syntax in type strings | [`src/parser/parser.ts`](src/parser/parser.ts) |
| New primitive / leaf checks | [`builder/leafIr.ts`](src/generator/builder/leafIr.ts), [`semantics/expressibility.ts`](src/generator/semantics/expressibility.ts) |
| IR for a type construct | [`builder/index.ts`](src/generator/builder/index.ts) |
| Guard order / dedupe / fold | [`optimizer/IROptimizer.ts`](src/generator/optimizer/IROptimizer.ts) |
| PHP formatting (`if`, `foreach`, precedence) | [`render/renderPhp.ts`](src/generator/render/renderPhp.ts) |
| PHPDoc wrapper / class layout | [`render/IRRenderer.ts`](src/generator/render/IRRenderer.ts), [`php.ts`](src/generator/php.ts) |
| What is allowed to generate | [`checkability.ts`](src/generator/checkability.ts) |
