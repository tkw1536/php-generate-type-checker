import type { TypeNode } from './ast.ts';
import { TypeAliasResolveError, validateAliasGraph } from './aliasGraph.ts';
import { assignEntryNames } from './entryNames.ts';
import { extractInputTypes, type InputTypeEntry } from './extractInput.ts';
import { LexerError } from './lexer.ts';
import { ParseError } from './parseError.ts';
import { parseType } from './index.ts';
import {
  resolveAlias,
  substituteAliases,
} from './substituteAliases.ts';

export { TypeAliasResolveError };

/** Fully parsed checker input entry (ready for a single build path). */
export type ParsedCheckerEntry = {
  /** `@phpstan-type` alias name, or `null` for plain type expressions. */
  readonly aliasName: string | null;
  readonly typeString: string;
  readonly ast: TypeNode;
  /** Pre-assigned entry function / method name. */
  readonly functionName: string;
  /** Text for `@phpstan-assert-if-true` (alias name or formatted type). */
  readonly docType: string;
};

export type ParseCheckerInputOptions = {
  /** When true, inline alias cross-references into each body. Default: false. */
  readonly resolveAliases?: boolean;
};

/**
 * Parse mixed docblock / plain input into a uniform list of named entries.
 * Docblock handling ends here — callers must not branch on input shape.
 */
export function parseCheckerInput(
  source: string,
  options?: ParseCheckerInputOptions,
): readonly ParsedCheckerEntry[] {
  const extracted = extractInputTypes(source);
  const rawAsts = parseEntryAsts(extracted);
  const asts = resolveEntryAsts(extracted, rawAsts, options?.resolveAliases === true);

  const names = assignEntryNames(
    extracted.map((entry, index) => ({
      aliasName: entry.name,
      typeString: entry.typeString,
      ast: asts[index],
    })),
  );

  return extracted.map((entry, index) => ({
    aliasName: entry.name,
    typeString: entry.typeString,
    ast: asts[index],
    functionName: names[index].functionName,
    docType: names[index].docType,
  }));
}

function parseEntryAsts(entries: readonly InputTypeEntry[]): TypeNode[] {
  const asts: TypeNode[] = [];
  for (const [index, entry] of entries.entries()) {
    try {
      asts.push(parseType(entry.typeString));
    } catch (err) {
      throw remapEntryParseError(err, entry, index);
    }
  }
  return asts;
}

/** Map positions relative to {@link InputTypeEntry.typeString} onto the full input. */
function remapEntryParseError(
  err: unknown,
  entry: InputTypeEntry,
  expressionIndex: number,
): ParseError {
  if (err instanceof ParseError) {
    return new ParseError(
      err.message,
      entry.typeStart + err.pos,
      expressionIndex,
    );
  }
  if (err instanceof LexerError) {
    return new ParseError(
      err.message,
      entry.typeStart + err.pos,
      expressionIndex,
    );
  }
  if (err instanceof Error) {
    return new ParseError(err.message, entry.typeStart, expressionIndex);
  }
  return new ParseError(String(err), entry.typeStart, expressionIndex);
}

function resolveEntryAsts(
  entries: readonly InputTypeEntry[],
  rawAsts: readonly TypeNode[],
  resolveAliases: boolean,
): TypeNode[] {
  const namedDefs: {
    readonly name: string;
    readonly ast: TypeNode;
    readonly typeStart: number;
  }[] = [];
  for (const [index, entry] of entries.entries()) {
    if (entry.name !== null) {
      namedDefs.push({
        name: entry.name,
        ast: rawAsts[index],
        typeStart: entry.typeStart,
      });
    }
  }

  if (namedDefs.length > 0) {
    validateAliasGraph(namedDefs);
  }

  if (!resolveAliases || namedDefs.length === 0) {
    return [...rawAsts];
  }

  const rawByName = new Map<string, TypeNode>();
  for (const def of namedDefs) {
    rawByName.set(def.name, def.ast);
  }

  const resolvedByName = new Map<string, TypeNode>();
  const resolving = new Set<string>();
  for (const def of namedDefs) {
    resolveAlias(def.name, rawByName, resolvedByName, resolving);
  }

  return rawAsts.map((ast, index) => {
    const entry = entries[index];
    if (entry.name !== null) {
      return resolvedByName.get(entry.name)!;
    }
    return substituteAliases(ast, rawByName, resolvedByName, new Set());
  });
}

/** Whether the parse result includes any `@phpstan-type` alias. */
export function hasPhpstanTypeAliases(
  entries: readonly ParsedCheckerEntry[],
): boolean {
  return entries.some((entry) => entry.aliasName !== null);
}
