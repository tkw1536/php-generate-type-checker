import type { TypeNode } from '../../parser/ast.ts';
import type { Block, ValueRef } from '../ir/types.ts';

/** Whether a value or foreach key is checked with a single boolean expression. */
export type CheckContext = 'value' | 'expression';

/**
 * Per-invocation state for {@link build}. `resolveCheckerName` and
 * `allocateLoopPair` are supplied by the pipeline; other fields are set by
 * the builder while descending the type tree.
 */
/** Options supplied by the pipeline before {@link build} wires recursion. */
export type BuildInput = {
  /** Maps a nested type to its helper function name (union delegation). */
  resolveCheckerName: (type: TypeNode) => string;
  /** Allocates distinct foreach variable names (`$key1`, `$value1`, …). */
  allocateLoopPair: () => { key: string; value: string };
};

export type Context = BuildInput & {
  /** Recursively build a statement block for a type at `subject`. */
  buildStatements: (
    node: TypeNode,
    subject: ValueRef,
    overrides?: Partial<Context>,
  ) => Block;
  /**
   * `value` (default): emit fail-if guards and trailing `return true`.
   * `expression`: one `buildExpr` guard (e.g. array keys in foreach).
   */
  checkContext?: CheckContext;
  /** Skip redundant `is_array` when an earlier check already established array-ness. */
  assumeVarIsArray?: boolean;
  /** Skip redundant `is_object` when an earlier check already established object-ness. */
  assumeVarIsObject?: boolean;
  /** When false, omit top-level container-kind guards (shape fields, tuple slots). */
  includeArrayGuard?: boolean;
  /** Inside foreach bodies: nested unions use fail-if, not root return-or. */
  inLoopBody?: boolean;
  /** Shape/tuple field context (affects never empty-array checks). */
  inShapeField?: boolean;
  /** `ValueRef` used as the `foreach` iterable (defaults to current subject). */
  iterable?: ValueRef;
};
