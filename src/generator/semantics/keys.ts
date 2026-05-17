/**
 * Stable keys for deduplicating checker functions (same logical type → one function).
 */
import type { TypeNode } from '../../parser/ast.ts';
import { formatType } from '../../parser/format.ts';

/** Deterministic key for deduplicating checker function bodies. */
export function typeDedupeKey(node: TypeNode): string {
  return formatType(node);
}
