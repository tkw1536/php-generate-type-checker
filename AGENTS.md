# AGENTS.md

## Project overview

Parse PHPStan PHPDoc types and emit PHP 8+ runtime checkers (`@phpstan-assert-if-true`); Vite UI in this repo.

## Setup commands

```bash
corepack enable
yarn install
yarn dev      # local UI (prefer https://check.guys.wtf to try)
yarn build    # tsc + Vite production bundle
yarn preview
yarn lint
yarn lint:fix
```

Stack: TypeScript ^7, Vite ^8, Vitest ^4, Oxlint + oxlint-tsgolint (type-aware), Yarn 4.18.0 (Corepack), Node latest (CI). PHP is generated output only.

## Testing

```bash
yarn test
yarn test:watch
yarn lint
yarn lint:fix
yarn spellcheck
```

- Unit/integration: `*.test.ts` next to modules under `src/`
- Whole-UI: `src/main.test.ts` (happy-dom)
- Parser fixtures: edit `src/parser/testdata/*.IN` → `yarn update_fixtures:parser` → commit matching `*.json`
- Generator fixtures: edit `src/generator/testdata/*.IN` → `yarn update_fixtures:generator` → commit matching `*.json`
- When changing generator output behavior, always add a generator golden for the new/changed case unless an equivalent `*.IN` case already exists
- Optional: `yarn review_fixtures:generator` (interactive golden review)

## Code style

```ts
import { describe, expect, it } from 'vitest';
import { generateChecker } from './index.ts';
```

Linting is [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) with type-aware TypeScript checks: stock category presets for high-signal correctness (plus a bit of strictness), not a hand-tuned rule list. Exact settings live in [`.oxlintrc.json`](.oxlintrc.json); what each stock rule means is in the [Oxlint rules reference](https://oxc.rs/docs/guide/usage/linter/rules.html). Project-specific rules live under [`oxlint-plugins/`](oxlint-plugins/) (currently `local/no-reexport`, which forbids `export … from` / `export * from` re-exports). Do not invent rule lists or mass-fix with `yarn lint:fix` unless asked. Do not re-export — import from the defining module instead.

For switch exhaustiveness (or other “impossible” paths), do **not** use `const x: never = …`. Throw instead, like Go’s `panic("never reached")`:

```ts
default:
  throw new Error('never reached');
```

## Git workflow

- No special branch or commit format.
- Before merge, keep CI green:

```bash
yarn test
yarn build
yarn lint
yarn spellcheck
```

## Warnings

- ABSOLUTELY NO LINT IGNORES (`oxlint-disable`, `eslint-disable`, or equivalents). Fix the code or adjust shared config — never suppress.
- Do **not** turn rules off / weaken shared lint config unless the user explicitly asks to disable or change that specific rule. Prefer fixing code. (See the oxlint config file for what is currently off per prior request.)
- NO WRITE INTERACTIONS UNLESS EXPLICITLY REQUESTED. Do not edit, create, delete, move, or overwrite files unless the user clearly asked for that change. Read-only investigation is fine; applying fixes is not, until asked.
- NEVER run `git checkout`, `git restore`, `git reset`, or any other command that discards or overwrites working-tree changes unless the user explicitly requests that exact recovery/discard operation.
- Never invent `package.json` scripts; only use scripts that exist.
- Keep URL fragment state backwards compatible (`src/ui/fragmentState.ts`).
- Do not hand-edit golden `*.json`; regenerate from `*.IN`.
- Do not treat this as a published library API. There is **no** library-consumer backwards compatibility — rename/remove internal exports freely; update all in-repo call sites instead of leaving compatibility shims.
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
