/**
 * Print a {@link TypeNode} as a single-line PHPStan-style type string for PHPDoc.
 */
import type { TypeNode } from '../../parser/ast.ts';
import { formatType } from '../../parser/format.ts';

/**
 * Format type for `@phpstan-assert-if-true … $value` (single line, no comment delimiters).
 */
export function formatTypeForPhpstanDoc(node: TypeNode): string {
  return escapePhpdocTypeLine(formatType(node));
}

/** Escapes a type string for safe use inside `/** … *\/` (one line). */
function escapePhpdocTypeLine(type: string): string {
  return type.replace(/\*\//g, '* /');
}
