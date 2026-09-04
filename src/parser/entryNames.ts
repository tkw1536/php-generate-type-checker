import type { TypeNode } from './ast.ts';
import { formatType } from './format.ts';

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

/** Propose an `is{Slug}` name from a type (no collision handling). */
export function proposeIsStyleName(type: TypeNode): string {
  return slugToIsName(formatType(type));
}

function slugToIsName(formatted: string): string {
  const parts = formatted.split(/[^a-zA-Z0-9]+/u).filter((p) => p.length > 0);
  let slug = parts
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join('');
  if (slug.length === 0) {
    slug = 'Type';
  }
  if (/^[0-9]/u.test(slug)) {
    slug = `T${slug}`;
  }
  return `is${slug}`;
}

/** Allocate `base`, then `base_2`, `base_3`, … until unused. */
export function allocateUniqueName(base: string, used: ReadonlySet<string>): string {
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${n}`;
    n++;
  }
  return candidate;
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
  options?: { readonly nameFunctionsByType?: boolean },
): readonly AssignedEntryNames[] {
  const nameByType = options?.nameFunctionsByType !== false;
  const used = new Set<string>();
  const unnamedByTypeKey = new Map<string, string>();
  let sequentialIndex = 0;

  const nextSequentialBase = (): string => {
    const index = sequentialIndex;
    sequentialIndex++;
    return index === 0 ? 'check' : `check_${index}`;
  };

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
    const base = nameByType ? proposeIsStyleName(ast) : nextSequentialBase();
    const functionName = takeUnique(base);
    unnamedByTypeKey.set(typeKey, functionName);
    return functionName;
  };

  return entries.map((entry) => {
    const docType = entry.aliasName ?? formatType(entry.ast);
    if (entry.aliasName !== null) {
      const base = nameByType
        ? aliasToIsName(entry.aliasName)
        : nextSequentialBase();
      return { functionName: takeUnique(base), docType };
    }
    return { functionName: takeUnnamed(entry.ast), docType };
  });
}
