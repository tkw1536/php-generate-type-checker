# AGENTS.md

## Project overview

Parse PHPStan PHPDoc types and emit PHP 8+ runtime checkers (`@phpstan-assert-if-true`); Vite UI and Node CLI in this repo.

## Setup commands

```bash
corepack enable
yarn install
yarn dev      # local UI (prefer https://check.guys.wtf to try)
yarn cli --help  # or: php-generate-type-checker --help (package bin)
yarn build    # tsc + Vite production bundle
yarn preview
yarn lint
yarn lint:fix
```

Stack: TypeScript ^7, Vite ^8, Vitest ^5, Oxlint + oxlint-tsgolint (type-aware), Yarn 4.18.0 (Corepack), Node latest (CI). PHP is generated output only.

## Testing

```bash
yarn test
yarn test:watch
yarn lint
yarn lint:fix
yarn spellcheck
```

- Unit/integration: `*.test.ts` next to modules under `src/`
- CLI: `src/cli/*.test.ts`
- Whole-UI: `src/main.*.test.ts` (happy-dom)
- Parser fixtures: edit `src/parser/testdata/*.IN` → `yarn update_fixtures:parser` → commit matching `*.json`
- Generator success fixtures: edit `src/generator/testdata/*.IN` → `yarn update_fixtures:generator` → commit matching `*.golden.php` (see **Generator golden PHP format** below)
- Generator error fixtures: edit `src/generator/testdata/errors.IN` only; Vitest asserts each line throws (no JSON / no PHP)
- When changing generator output behavior, always add a generator golden for the new/changed case unless an equivalent `*.IN` case already exists
- When changing parser, generator, optimizer, or render behavior described in README **Technical Overview** (type checks, optimizer passes, or pipeline phases), update that section to match
- Optional: `yarn review_fixtures:generator` (interactive golden review)
- `yarn check:phpstan` analyses committed `*.golden.php` in place (no disk writes; expects `phpstan/phpstan.phar`). Download with `yarn download:phpstan` (optional version; default `latest`). CI workflow `.github/workflows/phpstan-goldens.yml` runs `yarn download:phpstan -- $PHPSTAN_VERSION` then the same check — bump `PHP_VERSION` / `PHPSTAN_VERSION` at the top of that file
- Optimize fixpoints must converge under configured caps on success goldens: `outerFixpointCapped` / `blockFixpointCapped` / `simplifyFixpointCapped` / `exprNormalizeCapped` stay false (same invariants suite)
- Optimize result is final IR (`OptimizeResult.ir`); explanation is `steps` (UI Trace). Snapshots never store temp names — UI assigns them at render time.
- Rewriters return value + reason (`ExprRewrite` for exprs; block passes use `blockStep` + `commitReason`); every real modification appears in the step tree (top-level or nested `reason.children`). Identity = `reason: { kind: 'none' }`.
- Optimize trace must stay honest: enforced by `src/generator/optimizer/trace/invariants.test.ts` over generator success fixtures (annotated `checker` IR, not rendered PHP). Rewrite that test freely when step types change; keep the semantics.
- Per checker program: first top-level step is always `trace.initial` (Build IR; `checker.before` = builder body); last top-level `checker.after` = optimized body when that program still exists after prune; consecutive `checker.after[i]` = `checker.before[i+1]`; no zero-diff top-level rewrites except `trace.initial` and `facts.env.extend` (env-only bookkeeping); consecutive same-program `facts.env.extend` steps are merged (children appended)
- Prune steps: last prune `checker.after` = final optimized IR; same chain and no-ghost rules
- Trace-only fixes must not change optimizer/PHP output or edit generator golden `*.golden.php`
- When changing trace recording, keep those invariants green — do not weaken or skip the invariant test
- Fact proofs: every `withTrueFact` / `withFalseFact` add is traced (`facts.env.*` under `facts.env.extend`); `proveTrue` / `proveFalse` / `facts.absorb` / `simplify.normalize.absorb` nest reconstructible proof children (env how, equals/entails, imply bridge). Prefer assumed, then equals over entails. No bare boolean success on decision paths — use `implyProof` / `prove*Proof` / `EnvHow`
- Composed simplify may nest normalize micro-steps under one checker-advancing parent `simplify.normalize` (`reason.children`) — still one top-level head advance for that package
- Do not reintroduce `facts.commit`-style shadow repairs or bool-literal env facts; after a cond folds to `FALSE`, do not seed the env with that literal

## Generator golden PHP format

Success goldens are valid PHP 8+ files named `<stem>.golden.php` next to `<stem>.IN` (grep/glob: `*.golden.php`).
The `.golden.php` suffix makes them easy to find; the stem matches the input list (`function.IN` → `function.golden.php`).
Error cases live in `errors.IN` only (Vitest reads them directly; no regenerate artifact).
Parser goldens remain JSON (`source` / `ast`).

Case identity / namespace hashing lives in [`src/generator/testdata/goldenCase.ts`](src/generator/testdata/goldenCase.ts); encode/decode in [`src/generator/testdata/goldenPhp.ts`](src/generator/testdata/goldenPhp.ts).
Regenerate with `yarn update_fixtures:generator` — do not hand-edit goldens.

**Why PHP files (not JSON):** Vitest still asserts `generateChecker(…) ===` extracted body, and `yarn check:phpstan` can pass the committed paths straight to PHPStan without regenerating or writing a temp pack.
Disjoint `Golden\<id>` namespaces keep repeated `isInt` / `TypeChecker` names from colliding across cases in one analyse.

**File header:**

```php
<?php

// Code generated by yarn update_fixtures:generator; DO NOT EDIT.
// Generator success fixtures for <stem>.IN.

declare(strict_types = 1);
```

The first comment matches Go’s `^// Code generated .* DO NOT EDIT\.$` so humans and tools treat the file as generated.
The second line briefly names the suite.
`declare(strict_types = 1);` is once per file.
**Case blocks** (parseable subset — tests and PHPStan remapping extract these without running PHP):

```php
// @gtc-golden-begin {"input":"int","output":"function"}
namespace Golden\hc7e30287db5c {
/* exact generateChecker output */
}
// @gtc-golden-end
```

Begin JSON carries `input`, `output`, and sparse true-only flags (`emitPhpstanTypeAliases`, `verbosePhpdoc`, `sealArrayShapes`).
Namespace leaf is `h` + the first 12 hex chars of SHA-256 (`node:crypto`) over the **case identity** (input + those options), never over the expected PHP body.
The leading `h` keeps the segment a valid PHP name when the hex would otherwise start with a digit.
Hashing the body would rename the namespace whenever output changes and hide the real diff; goldens exist so the namespace stays stable while Vitest checks the body.
Options belong in the key because the same input text can appear with different generation flags.
Identical case keys in one suite are deduped; true collisions fail the update script.

**PHPStan source map:** `check-phpstan.mjs` must not write files.
It analyses every success `*.golden.php` path in one invocation and builds line ranges in memory from the begin/end markers so raw `file:line:` hits can be annotated `[golden=…]`.
Exit non-zero if and only if analysis reported errors (setup failures before analyse also exit non-zero).

## CLI

The CLI option interface is **stable**.
Do not rename or remove flags lightly; add new ones carefully and document them in `--help` / README / this file.
Package stays private; `package.json` `bin` (`php-generate-type-checker`) is for local / workspace use only (no npm publish).

Stable surface (see `yarn cli --help` for details):

- Input: positional types **or** `--file` / `-f` (`-` = STDIN)
- Generate: `--emit`, `--optimize` / `--no-optimize`, `--verbose-phpdoc`, `--emit-aliases`, `--resolve-aliases`, `--seal-array-shapes`, `--unsafe-string-array-keys`
- Output: default PHP on STDOUT; `--type` or `--trace` (mutually exclusive)

`--type` and `--trace` **payload schemas are unstable** (inspection only; same data as the UI Type / Trace tabs).
Parse / generate errors on STDERR should show location like the UI (snippet + caret), via shared `describeError`.

Shared generate path: `runGeneratePipeline` / `formatTypeAstJson` (UI and CLI); `generateChecker` remains the PHP-only golden helper.

## Code style

```ts
import { describe, expect, it } from 'vitest';
import { generateChecker } from './index.ts';
```

Linting is [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) with type-aware TypeScript checks: stock category presets for high-signal correctness (plus a bit of strictness), not a hand-tuned rule list. Exact settings live in [`.oxlintrc.json`](.oxlintrc.json); what each stock rule means is in the [Oxlint rules reference](https://oxc.rs/docs/guide/usage/linter/rules.html). Project-specific rules live under [`oxlint-plugins/`](oxlint-plugins/) (currently `local/no-reexport`, which forbids `export … from`, `export * from`, and `export { name }` away from the definition). Do not invent rule lists or mass-fix with `yarn lint:fix` unless asked. Export only at the definition site — do not re-export or use bare `export { name }`.

For switch exhaustiveness (or other “impossible” paths), do **not** use `const x: never = …`. Throw instead, like Go’s `panic("never reached")`:

```ts
default:
  throw new Error('never reached');
```

## Code comments

Comments must not duplicate the code (verbatim or restated).
Prefer **why**, plus non-obvious pre/post-conditions.
Use Inline comments sparingly; prefer clearer code when something is unclear.
Most functions / classes / methods should have a comment; omit only when names and code are obvious.
Same as README prose: **one sentence per line; no hard-wrapping** long sentences across lines.
Prefer shorter phrasing where possible.

## Git workflow

- No special branch or commit format.
- Before merge, keep CI green:

```bash
yarn test
yarn build
yarn lint
yarn spellcheck
```

## README prose

In `README.md`, prefer one sentence per line.
Do not hard-wrap long sentences across multiple lines.
Keep Markdown tables column-aligned in the source (pad cells so `|` separators line up).
The same one-sentence-per-line / no hard-wrap rule applies to code comments (see **Code comments**).

## Warnings

- ABSOLUTELY NO LINT IGNORES (`oxlint-disable`, `eslint-disable`, or equivalents). Fix the code or adjust shared config — never suppress.
- Do **not** turn rules off / weaken shared lint config unless the user explicitly asks to disable or change that specific rule. Prefer fixing code. (See the oxlint config file for what is currently off per prior request.)
- NO WRITE INTERACTIONS UNLESS EXPLICITLY REQUESTED. Do not edit, create, delete, move, or overwrite files unless the user clearly asked for that change. Read-only investigation is fine; applying fixes is not, until asked.
- NEVER run `git checkout`, `git restore`, `git reset`, or any other command that discards or overwrites working-tree changes unless the user explicitly requests that exact recovery/discard operation.
- Never invent `package.json` scripts; only use scripts that exist.
- Keep URL fragment state backwards compatible (`src/ui/fragmentState.ts`).
- The UI must never invent alternate payloads or special-case shapes for display. Each output tab shows real data from the corresponding stage (Type = parse entries / AST; Trace = optimizer `steps`; PHP = rendered checker). Presentation (JSON tree, PHP rendering of IR snapshots, expand defaults) is fine; changing the root shape or omitting fields based on input kind is not.
- Do not hand-edit generator `*.golden.php` or parser golden `*.json`; regenerate from `*.IN` (parser errors JSON is hand-maintained; generator errors are `errors.IN` only).
- Do not edit generator golden `*.golden.php` when fixing optimize-trace honesty; keep emitted IR/PHP identical and fix the tracer instead.
- This package is not published for external use; the only consumers live in this repository. Prefer deleting or reshaping internals over compatibility shims or leftover files. There is **no** library-consumer backwards compatibility — rename/remove internal exports freely; update all in-repo call sites instead of leaving compatibility shims.
- Do not keep code just to keep tests green. If something exists only so old tests still pass, either remove the test (when it only covered dead behavior), move helpers into test-only code (`*.test.ts` / `test-utils/` / `testdata/`), or redesign the tests around the real API. Do not retain production exports, fixtures, or regenerate artifacts solely as test glue.
- Always keep existing CI checks passing.
- Generated PHP must be nicely formatted and pass PHPStan at level 10 (max / strictest). Anything else is a bug.

## README screenshot

Do **not** use Puppeteer, CDN helpers, `html2canvas`, or the DevTools device toolbar.

When updating `docs/ui.png`:

**Agent (automatic):**
- Create `docs/` if missing.
- After the user saves the PNG, move/rename it to `docs/ui.png` if it landed elsewhere in the project or Downloads path they point to.
- In `README.md` under Try it, set the image to `![…](docs/ui.png)` with a short alt description of the UI shown, and remove `<!-- screenshot: docs/ui.png -->` if present.

**User (manual) — Firefox only:**
1. Run `yarn dev` and open `http://localhost:5173/` in Firefox (allow popups for localhost).
2. Paste this in the page console and run it:

```js
(() => {
  localStorage.setItem('php-type-checker-theme', 'light');
  const W = 1280;
  const H = 800;
  const win = window.open(
    location.href,
    'readme-screenshot',
    `popup=yes,width=${W},height=${H}`,
  );
  if (!win) {
    throw new Error('Popup blocked — allow popups for localhost and rerun');
  }
  const fixSize = () => {
    win.resizeTo(W + (win.outerWidth - win.innerWidth), H + (win.outerHeight - win.innerHeight));
  };
  win.addEventListener('load', fixSize);
  setTimeout(fixSize, 500);
})();
```

3. In the **popup** window: leave the UI alone. Right-click the page → **Take Screenshot**.
4. In the screenshot UI, choose the **visible** / Save visible option (not full page) → **Download**.
5. The PNG is saved under `~/Downloads/`. The filename starts with `Screenshot` (Firefox adds a date/time).
6. Tell the agent the full path to that file (or move it into the repo yourself).
