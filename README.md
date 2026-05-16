# PHP Type Checker Generator

Parse [PHPDoc types as supported by PHPStan](https://phpstan.org/writing-php-code/phpdoc-types) and generate PHP 8+ runtime checker code with `@phpstan-assert-if-true` annotations.

> **Disclaimer:** This project is vibe-coded — built quickly with minimal review. Use it at your own risk; always check any outputted code for correctness yourself.

## Features

- **Type parser** — lexer and recursive-descent parser for PHPDoc-style types (primitives, unions, intersections, shapes, generics, callables, int ranges, and common aliases).
- **Runtime checkers** — emits `bool` functions (or class methods) that validate `mixed $value` against a type string.
- **Checker IR pipeline** — build → optimize → emit, with JSON snapshots in the UI for debugging.
- **Deduped checker functions** — nested or repeated types share one function per canonical type (e.g. `array<int>` inside a shape and inside a union).
- **Output shapes** — standalone `function`, or `public` / `protected` / `private` `static` methods on a `TypeChecker` class.
- **Naming** — default `is{TypeSlug}` entry and helper names from the type AST; optional legacy `check` / `check_N`.
- **Layout** — compact combined `if` guards (default) or readable one-`if`-per-guard mode.
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
| **Readable layout** | One `if` per guard, preserve builder order (on) vs combined guards + hoisting (off) |
| **Emit as** | Standalone function, or `public` / `protected` / `private` static method on `TypeChecker` |

**Output tabs** (left → right):

1. **Type AST** — parsed JSON AST
2. **IR (build)** — checker IR straight from the builder
3. **IR (optimized)** — IR after dedupe, hoist, etc.
4. **PHP Code** — final generated PHP

The header **theme toggle** (☾ / ☀) follows the system preference until you override it. Highlight.js uses GitHub (light) and GitHub Dark themes.

## Code structure

```
src/
├── index.ts                 # public API (parseType, generateChecker, …)
├── main.ts                  # Vite app bootstrap
├── theme.ts, style.css
├── parser/                  # PHPDoc type → AST
│   ├── parser.ts, lexer.ts, ast.ts
│   └── parseType.test.ts
├── generator/               # AST → PHP checkers
│   ├── checkerIR.ts         # shared IR types (CheckerProgram, Check, …)
│   ├── checkerPipeline.ts   # materialize built + optimized IR, emit order
│   ├── checkerPipeline.test.ts
│   ├── builder/             # AST → checker IR
│   │   ├── buildCheckerIR.ts
│   │   ├── checksFromType.ts
│   │   └── checkerFunctionNames.ts
│   ├── optimizer/           # IR cleanup (dedupe, hoist failIf, …)
│   │   └── optimizeCheckerIR.ts
│   ├── emitter/             # IR → PHP lines → formatted body
│   │   ├── emitCheckerIR.ts
│   │   ├── emit.ts          # pipeline emit, compact unions, class wrapper
│   │   └── renderCheck.ts
│   ├── checkability.ts      # what can / cannot be generated
│   ├── normalize.ts         # AST normalization before codegen
│   ├── simpleTypes.ts       # leaf PHP expressions
│   ├── typeDoc.ts, typeKey.ts, unionOrder.ts
│   ├── php.ts               # @phpstan-assert-if-true wrappers, class layout
│   ├── generateChecker.test.ts
│   └── index.ts
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
2. **Normalize & check** — [`normalize.ts`](src/generator/normalize.ts), [`checkability.ts`](src/generator/checkability.ts)
3. **Build pipeline** — [`buildCheckerPipeline`](src/generator/checkerPipeline.ts):
   - For each deduped checker function name: **built** IR via [`builder/buildCheckerIR.ts`](src/generator/builder/buildCheckerIR.ts)
   - **Optimized** IR via [`optimizer/optimizeCheckerIR.ts`](src/generator/optimizer/optimizeCheckerIR.ts)
   - Shared **`order`** array: entry function first, then helpers as they are discovered
4. **Emit PHP** — [`emitter/emit.ts`](src/generator/emitter/emit.ts) walks optimized IR; compact expressible types may become a single `return` expression
5. **Wrap** — [`php.ts`](src/generator/php.ts) adds PHPDoc and optional `TypeChecker` class

### Checker IR (rough outline)

Each checker function is a **`CheckerProgram`**: parameter name + ordered **`statements`**.

Common statement kinds:

| Kind | Role |
|------|------|
| `failIf` | Guard with negated atom (`call` or `equals`) |
| `foreach` | Loop over array/list with nested body |
| `optional` | Shape field present only if key exists |
| `returnIf` / `returnOr` / `returnTrue` | Early success paths |

Atoms in checks are only **`call`** (e.g. `is_array`, `instanceof`) and **`equals`** (e.g. `$value === []`). PHPDoc primitive aliases are lowered in [`builder/checksFromType.ts`](src/generator/builder/checksFromType.ts); PHP text is rendered in [`emitter/renderCheck.ts`](src/generator/emitter/renderCheck.ts).

**Optimizer** (default): drop no-op guards, dedupe identical `failIf`, hoist guards before `foreach` / `optional`. With **readable layout**, hoisting is skipped so emit order matches the builder.

**Emitter**: batches consecutive top-level `failIf` into one `if (!a \|\| !b \|\| …)` unless readable mode is on.

## Programmatic API

```ts
import {
  parseType,
  generateChecker,
  checkerIRSnapshotsForType,
  GenerationError,
} from './src/index.ts';

const ast = parseType('array<string, int>');

const php = generateChecker('array<string, int>', {
  output: 'function',                      // or public_static, …
  nameFunctionsByType: true,               // default
  prioritizeReadabilityOverCompactness: false, // default
});

const { built, optimized } = checkerIRSnapshotsForType('list<int>');
```

Lower-level exports (see [`src/generator/index.ts`](src/generator/index.ts)) include `buildCheckerPipeline`, `optimizeCheckerIR`, `emitCheckerIR`, `emitFromPipeline`, and types `CheckerIR` / `CheckerPipeline`.

### Options reference

| Option | Default | Meaning |
|--------|---------|---------|
| `output` | `'function'` | Standalone function or class static method visibility |
| `nameFunctionsByType` | `true` | `is{TypeSlug}` vs `check` / `check_N` |
| `mainFunctionName` | derived from type | Entry function/method name |
| `prioritizeReadabilityOverCompactness` | `false` | Readable `if` layout + preserve statement order in optimizer |

## Tests

- **Unit / integration** — `*.test.ts` next to the module they cover (`src/parser/`, `src/generator/**/`, `src/ui/`).
- **Fixtures** — YAML frontmatter + body under [`src/support/fixtures/`](src/support/fixtures/); loaded by [`loadParserFixture.ts`](src/support/loadParserFixture.ts) and [`loadGeneratorFixture.ts`](src/support/loadGeneratorFixture.ts).

Run `yarn test` (Vitest).

## Where to extend

| Goal | Start here |
|------|------------|
| New syntax in type strings | [`src/parser/parser.ts`](src/parser/parser.ts) |
| New primitive / leaf checks | [`builder/checksFromType.ts`](src/generator/builder/checksFromType.ts), [`simpleTypes.ts`](src/generator/simpleTypes.ts) |
| IR shape for a type construct | [`builder/buildCheckerIR.ts`](src/generator/builder/buildCheckerIR.ts) |
| Guard order / dedupe | [`optimizer/optimizeCheckerIR.ts`](src/generator/optimizer/optimizeCheckerIR.ts) |
| PHP formatting (`if`, `foreach`) | [`emitter/emitCheckerIR.ts`](src/generator/emitter/emitCheckerIR.ts) |
| What is allowed to generate | [`checkability.ts`](src/generator/checkability.ts) |
| PHPDoc wrapper / class layout | [`php.ts`](src/generator/php.ts) |
