import type { TypeNode } from './ast.ts';
import { formatType } from './format.ts';
import { FunctionNameProposer } from './functionNameProposer.ts';

/** Map a `@phpstan-type` alias name to an `is{Name}` entry function name. */
export function aliasToIsName(aliasName: string): string {
  const base = aliasName.replace(/^\\+/u, '').split('\\').pop() ?? aliasName;
  const slug = base.replaceAll(/[^a-zA-Z0-9]+/gu, '');
  if (slug.length === 0) {
    return 'isType';
  }
  const normalized = slug[0].toUpperCase() + slug.slice(1);
  const withPrefix = /^[0-9]/u.test(normalized) ? `T${normalized}` : normalized;
  return `is${withPrefix}`;
}

/** Allocate `base`, then `base_2`, `base_3`, … until unused (PHP names are case-insensitive). */
export function allocateUniqueName(base: string, used: ReadonlySet<string>): string {
  let candidate = base;
  let n = 2;
  while (phpNameUsed(candidate, used)) {
    candidate = `${base}_${n}`;
    n++;
  }
  return candidate;
}

function phpNameUsed(name: string, used: ReadonlySet<string>): boolean {
  const lower = name.toLowerCase();
  for (const existing of used) {
    if (existing.toLowerCase() === lower) {
      return true;
    }
  }
  return false;
}

export type NamedInputEntry = {
  readonly aliasName: string | null;
  readonly typeString: string;
  readonly ast: TypeNode;
};

export type AssignedEntryNames = {
  readonly functionName: string;
  readonly docType: string;
};

/**
 * Assign entry function names for mixed alias / plain entries.
 * Unnamed entries with identical types share one function name (dedupe).
 */
export function assignEntryNames(
  entries: readonly NamedInputEntry[],
): readonly AssignedEntryNames[] {
  const used = new Set<string>();
  const unnamedByTypeKey = new Map<string, string>();
  const proposer = new FunctionNameProposer();

  const takeUnique = (base: string): string => {
    const functionName = allocateUniqueName(base, used);
    used.add(functionName);
    return functionName;
  };

  const takeUnnamed = (ast: TypeNode): string => {
    const typeKey = formatType(ast);
    const existing = unnamedByTypeKey.get(typeKey);
    if (existing !== undefined) {
      return existing;
    }
    const functionName = takeUnique(proposer.name(ast));
    unnamedByTypeKey.set(typeKey, functionName);
    return functionName;
  };

  return entries.map((entry) => {
    const docType = entry.aliasName ?? formatType(entry.ast);
    if (entry.aliasName !== null) {
      return {
        functionName: takeUnique(aliasToIsName(entry.aliasName)),
        docType,
      };
    }
    return { functionName: takeUnnamed(entry.ast), docType };
  });
}
