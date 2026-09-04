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
```

Stack: TypeScript ^7, Vite ^8, Vitest ^4, Yarn 4.18.0 (Corepack), Node latest (CI). PHP is generated output only.

## Testing

```bash
yarn test
yarn test:watch
yarn spellcheck
```

- Unit/integration: `*.test.ts` next to modules under `src/`
- Whole-UI: `src/main.test.ts` (happy-dom)
- Parser fixtures: edit `src/parser/testdata/*.IN` → `yarn update_fixtures:parser` → commit matching `*.json`
- Generator fixtures: edit `src/generator/testdata/*.IN` → `yarn update_fixtures:generator` → commit matching `*.json`
- Optional: `yarn review_fixtures:generator` (interactive golden review)

## Code style

```ts
import { describe, expect, it } from 'vitest';
import { generateChecker } from './index.ts';
```

## Git workflow

- No special branch or commit format.
- Before merge, keep CI green:

```bash
yarn test
yarn build
yarn spellcheck
```

## Warnings

- Never invent `package.json` scripts; only use scripts that exist.
- Keep URL fragment state backwards compatible (`src/ui/fragmentState.ts`).
- Do not hand-edit golden `*.json`; regenerate from `*.IN`.
- Do not treat this as a published library API.
- Always keep existing CI checks passing.
- Generated PHP must be nicely formatted and pass PHPStan at level 10 (max / strictest). Anything else is a bug.
