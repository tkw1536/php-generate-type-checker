# PHP Type Checker Generator

Parse [PHPDoc types as supported by PHPStan](https://phpstan.org/writing-php-code/phpdoc-types) and generate PHP 8+ runtime checker code with `@phpstan-assert-if-true` annotations.

> **Disclaimer:** This project is vibe-coded — built quickly with minimal review. Use it at your own risk; always check any outputted code for correctness yourself.

## Features

- **Type parser** — lexer and recursive-descent parser for PHPDoc-style types (primitives, unions, intersections, shapes, generics, callables, int ranges, and common aliases).
- **Sequential multi-type input** — `parseTypes` splits the input into several top-level types (token boundaries only, e.g. `array<string>array<int>` or `string int`; glued names like `stringint` stay one class).
- **Runtime checkers** — emits `bool` functions (or class methods) that validate `mixed $value` against each type.
- **Checker IR pipeline** — `buildMany` → `optimize` → `render`, with JSON IR tabs in the UI for debugging.
- **Deduped checker functions** — nested or repeated types share one helper per canonical type (e.g. `array<int>` inside a shape and inside a union).
- **Output shapes** — standalone `function`, or `public` / `protected` / `private` `static` entry methods on a `TypeChecker` class (helpers are always `private static` in class modes).
- **Naming** — default `is{TypeSlug}` entry and helper names from the type AST; optional legacy `check` / `check_N`.
- **Layout** — compact optimized IR (default) or readable one-`if`-per-guard mode (**Readable layout** skips the optimizer).
- **Web UI** — type input, example presets, generate options, and tabbed pipeline output with syntax highlighting and light/dark theme.

Types that cannot be checked at runtime (e.g. most `callable` signatures, unsupported generics, `literal-string`) fail with `GenerationError`.

## Commands

```bash
corepack enable   # once per machine, if Yarn is not available
yarn install
yarn dev          # web UI at http://localhost:5173
yarn test                      # vitest
yarn build                     # tsc + production bundle
yarn spellcheck                # cspell
yarn update_fixtures:parser    # parser.success.IN → parser.success.json
yarn update_fixtures:generator # generator/testdata/*.IN → *.json
```

Golden fixture sources live next to each module under `testdata/`:

- **Parser** — [`parser.success.IN`](src/parser/testdata/parser.success.IN) (one list; blank lines and `#` comments are ignored)
- **Generator** — [`function.IN`](src/generator/testdata/function.IN), [`public_static.IN`](src/generator/testdata/public_static.IN), and sibling files per output mode, plus [`errors.IN`](src/generator/testdata/errors.IN) for types that must throw `GenerationError`

## Web UI

Single workspace: **types input** on the left, **pipeline output** on the right. Output refreshes automatically when the input or options change (debounced).

**Generate options** (footer of the input panel):

| Control | Effect |
|--------|--------|
| **Name from type** | `is{TypeSlug}` names (on) vs legacy `check` / `check_N` (off) |
| **Optimize** | Run optimizer; PHP from **IR (optimized)** (on) vs **IR (build)** (off) |
| **Emit as** | Standalone function, or entry as `public` / `protected` / `private` `static` on `TypeChecker` |

**Output tabs** (left → right):

1. **Type AST** — parsed segments (`start`, `end`, `ast`) as JSON
2. **IR (build)** — checker IR after `buildMany`
3. **IR (optimized)** — IR after optimizer passes (or a note when optimize is off)
4. **PHP Code** — final generated PHP

The header **theme toggle** (☾ / ☀) follows the system preference until you override it. Highlight.js uses GitHub (light) and GitHub Dark themes.

## Code structure

```
src/
├── index.ts                 # public API (parseType, parseTypes, build, buildMany, …)
├── main.ts                  # Vite app bootstrap
├── theme.ts, style.css, highlight.ts
├── parser/                  # PHPDoc type → AST
│   ├── parser.ts            # parseType, parseTypes
│   ├── lexer.ts, ast.ts, format.ts
│   ├── parser.test.ts
│   └── testdata/            # parser.success.IN → parser.success.json, parser.errors.json
├── generator/
│   ├── pipeline.ts          # build(), buildMany(), optimize(), renderChecker()
│   ├── index.ts             # generateChecker()
│   ├── index.test.ts        # generateChecker golden tests (loads testdata/*.json)
│   ├── options.ts, errors.ts
│   ├── ir/                  # CheckerIR, Expr, Stmt, ValueRef, equals, substitute
│   ├── builder/             # TypeNode → checker IR (per program)
│   │   ├── index.ts
│   │   ├── context.ts, errors.ts
│   │   ├── ast/             # classify, collection helpers
│   │   ├── expr/            # guards, keywords, literals → Expr
│   │   ├── statements/      # shape, collection, union
│   │   └── registry/        # FunctionNameRegistry, name proposers
│   ├── optimizer/           # modular IR passes (see below)
│   │   ├── index.ts         # optimize() fixpoint + prunePrograms
│   │   ├── inline.ts, dedupe.ts, combine.ts, flatten.ts, unnest.ts
│   │   ├── knownFacts.ts, expression.ts, dce.ts, prune.ts
│   │   └── params.ts
│   ├── render/
│   │   ├── php.ts           # IR → PHP function body
│   │   ├── context.ts, refs.ts
│   │   ├── phpdoc.ts        # PHPStan type strings for @phpstan-assert
│   │   ├── output.ts        # class/function wrappers, visibility
│   │   └── index.ts
│   ├── pipeline.test.ts
│   └── testdata/            # *.IN → *.json (function, public_static, errors, …)
│       └── update-testdata.mjs
└── ui/
    ├── errorDisplay.ts      # parse/generation errors with segment index
    └── examples.ts
```

## Generation pipeline

End-to-end flow for `generateChecker(typeString)`:

1. **Parse** — `parseTypes` → one or more `TypeSegment` ASTs ([`src/parser/parser.ts`](src/parser/parser.ts))
2. **Build** — [`buildMany()`](src/generator/pipeline.ts) materializes all entry checkers and shared helpers into one [`CheckerIR`](src/generator/ir/types.ts) via [`builder/index.ts`](src/generator/builder/index.ts) and [`FunctionNameRegistry`](src/generator/builder/registry/index.ts)
3. **Optimize** — single [`optimize()`](src/generator/optimizer/index.ts) over the combined IR unless `prioritizeReadabilityOverCompactness` is true
4. **Render** — single [`render()`](src/generator/render/index.ts): bodies via [`php.ts`](src/generator/render/php.ts), wrappers via [`output.ts`](src/generator/render/output.ts)

There is no per-type optimize/render loop: all segments share one IR, one optimize pass, one render pass.

### Checker IR (outline)

`CheckerIR` is `{ programs, order, entries }`.

- **`programs`** — `Record<string, CheckerProgram>` (parameter + `Stmt[]` body)
- **`order`** — emission / optimization order (entries and helpers)
- **`entries`** — user-facing checker names in parse order; never pruned by the optimizer

Each **`CheckerProgram`** body uses:

| Stmt | Role |
|------|------|
| `if` | Condition + body (fail-if, optional shape field checks) |
| `foreach` | Loop with nested body |
| `return` | Boolean expression |

**`Expr`** kinds: `bool`, `not`, `and`, `or`, `call`, `bin`, `instanceof`, `call_checker`. **`ValueRef`**: `$value`, array/property access.

### Optimizer (per program, fixpoint)

Outer loop over programs (reverse `order`), inner loop until stable:

1. **Inline** — substitute single-return helpers (`inline.ts`)
2. **Block phases** (`runPhases`): `dedupe` → `unnest` → `combine` → `flatten`
3. **Known facts** — branch-local boolean facts (`knownFacts.ts`)
4. **Simplify** — expression normalization (`expression.ts`)
5. **DCE** — drop unreachable / constant branches (`dce.ts`)
6. **Simplify** again

Then **`prunePrograms`** removes unreferenced helpers; all `entries` are kept.

## Programmatic API

```ts
import {
  parseTypes,
  buildMany,
  optimize,
  render,
  GenerationError,
} from './src/index.ts';

const { segments, source } = parseTypes('array<string>array<int>');
const types = segments.map((s) => s.ast);

const { ir: built, typesByName } = buildMany(types, {
  nameFunctionsByType: true,
  segmentSources: segments.map((s) => source.slice(s.start, s.end)),
});
const ir = optimize(built);
const php = render(ir, {
  typeString: source,
  typesByName,
  output: 'function',
});
```

Single-type convenience (must consume full input):

```ts
import { parseType, build } from './src/index.ts';

const { ir, typesByName } = build(parseType('int'));
```

Wrapper used by fixtures:

```ts
import { generateChecker } from './src/generator/index.ts';

const php = generateChecker('list<int>', {
  output: 'public_static',
  prioritizeReadabilityOverCompactness: false,
});
```

### Options reference

| Option | Default | Meaning |
|--------|---------|---------|
| `output` | `'function'` | Standalone function or class static entry visibility |
| `nameFunctionsByType` | `true` | `is{TypeSlug}` vs `check` / `check_N` |
| `mainFunctionName` | derived | Entry function/method name (first segment only in `buildMany`) |
| `prioritizeReadabilityOverCompactness` | `false` | When true, skip optimizer |

## Tests

- **Unit / integration** — `*.test.ts` next to the module (`src/parser/`, `src/generator/**/`, `src/ui/`)
- **Parser JSON** — [`src/parser/testdata/`](src/parser/testdata/) (`yarn update_fixtures:parser` / `update-testdata.mjs`)
- **Generator fixtures** — type lists in [`src/generator/testdata/*.IN`](src/generator/testdata/function.IN), golden PHP in matching `*.json`; exercised by [`index.test.ts`](src/generator/index.test.ts) (`yarn update_fixtures:generator` / `update-testdata.mjs`)

Run `yarn test` (Vitest).

## Where to extend

| Goal | Start here |
|------|------------|
| New syntax in type strings | [`src/parser/parser.ts`](src/parser/parser.ts) |
| Multi-type splitting rules | [`parseTypes`](src/parser/parser.ts) |
| New primitive / leaf checks | [`builder/expr/`](src/generator/builder/expr/), [`builder/ast/`](src/generator/builder/ast/) |
| IR for shapes / unions / collections | [`builder/statements/`](src/generator/builder/statements/) |
| Helper naming / collisions | [`builder/registry/`](src/generator/builder/registry/) |
| IR passes (inline, facts, DCE, …) | [`optimizer/`](src/generator/optimizer/) |
| PHP formatting (`if`, `foreach`, precedence) | [`render/php.ts`](src/generator/render/php.ts) |
| PHPDoc type strings | [`render/phpdoc.ts`](src/generator/render/phpdoc.ts) |
| Class layout / method visibility | [`render/output.ts`](src/generator/render/output.ts) |
| Segment-aware errors in the UI | [`ui/errorDisplay.ts`](src/ui/errorDisplay.ts) |
