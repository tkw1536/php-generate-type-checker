import type { ParsedCheckerEntry } from '../parser/parseInput.ts';

/** One entry’s Type-tab / `--type` JSON object (inspection only — not a stable contract). */
export type TypeAstEntryJson = {
  readonly aliasName: string | null;
  readonly typeString: string;
  readonly ast: ParsedCheckerEntry['ast'];
};

/** Alias + type string only (Type tab Source leaf). */
export type TypeAstSourceJson = {
  readonly aliasName: string | null;
  readonly typeString: string;
};

/** Payload for one parsed entry (CLI `--type` array element). */
export function typeAstEntryPayload(
  entry: ParsedCheckerEntry,
): TypeAstEntryJson {
  return {
    aliasName: entry.aliasName,
    typeString: entry.typeString,
    ast: entry.ast,
  };
}

/** Source leaf payload (alias name + input type string). */
export function typeAstSourcePayload(
  entry: ParsedCheckerEntry,
): TypeAstSourceJson {
  return {
    aliasName: entry.aliasName,
    typeString: entry.typeString,
  };
}

/** Pretty-printed JSON for the Source leaf (UI Copy). */
export function formatTypeAstSourceJson(entry: ParsedCheckerEntry): string {
  return JSON.stringify(typeAstSourcePayload(entry), null, 2);
}

/** Pretty-printed JSON for the AST leaf (UI Copy). */
export function formatTypeAstAstJson(entry: ParsedCheckerEntry): string {
  return JSON.stringify(entry.ast, null, 2);
}

/**
 * Pretty-printed JSON array of all entries (`--type` / CLI).
 * Shape is for inspection only — not a stable contract.
 */
export function formatTypeAstJson(
  entries: readonly ParsedCheckerEntry[],
): string {
  return JSON.stringify(
    entries.map((entry) => typeAstEntryPayload(entry)),
    null,
    2,
  );
}
