/** Hyphenated pseudo-types that use the named AST path but are not PHP class names. */
const PSEUDO_NAMED_TYPES = new Set([
  'open-resource',
  'closed-resource',
  'callable-array',
  'callable-object',
]);

const PHP_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/u;

/** True if `name` is a valid PHP class/interface/trait reference for `instanceof` / `::class`. */
export function isValidPhpClassName(name: string): boolean {
  if (name.length === 0) {
    return false;
  }
  let rest = name;
  if (rest.startsWith('\\')) {
    rest = rest.slice(1);
  }
  if (rest.length === 0) {
    return false;
  }
  const segments = rest.split('\\');
  return segments.every((segment) => PHP_IDENTIFIER.test(segment));
}

/**
 * Canonical lowercase spelling for a known pseudo-named type, or `null`.
 * Case-insensitive: `OPEN-RESOURCE` → `open-resource`.
 */
export function canonicalPseudoNamedType(name: string): string | null {
  const lower = name.toLowerCase();
  return PSEUDO_NAMED_TYPES.has(lower) ? lower : null;
}

/** Named types that may contain characters illegal in PHP class names (codegen special-cases). */
export function isPseudoNamedType(name: string): boolean {
  return canonicalPseudoNamedType(name) !== null;
}

/** True if a named type node may keep this identifier (valid class or known pseudo-type). */
export function isAllowedNamedType(name: string): boolean {
  return isPseudoNamedType(name) || isValidPhpClassName(name);
}
