import type { TypeNode } from '../parser/ast.ts';
import type { ParsedCheckerEntry } from '../parser/parseInput.ts';
import {
  resolveAlias,
  substituteAliases,
} from '../parser/substituteAliases.ts';

/**
 * ASTs with sibling `@phpstan-type` aliases substituted.
 * Independent of checker `resolveAliases` — examples always expand known aliases.
 */
export function astsWithAliasesInlined(
  entries: readonly ParsedCheckerEntry[],
): readonly TypeNode[] {
  const rawByName = new Map<string, TypeNode>();
  for (const entry of entries) {
    if (entry.aliasName !== null) {
      rawByName.set(entry.aliasName, entry.ast);
    }
  }
  if (rawByName.size === 0) {
    return entries.map((entry) => entry.ast);
  }

  const resolvedByName = new Map<string, TypeNode>();
  const resolving = new Set<string>();
  for (const name of rawByName.keys()) {
    resolveAlias(name, rawByName, resolvedByName, resolving);
  }

  return entries.map((entry) => {
    if (entry.aliasName !== null) {
      return resolvedByName.get(entry.aliasName)!;
    }
    return substituteAliases(entry.ast, rawByName, resolvedByName, new Set());
  });
}
