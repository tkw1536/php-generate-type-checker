import type { ParsedCheckerEntry } from '../parser/parseInput.ts';

/**
 * Same Type-tab JSON the UI shows.
 * Shape is for inspection only — not a stable contract.
 */
export function formatTypeAstJson(
  entries: readonly ParsedCheckerEntry[],
): string {
  return JSON.stringify(
    entries.map(({ aliasName, typeString, ast }) => ({
      aliasName,
      typeString,
      ast,
    })),
    null,
    2,
  );
}
