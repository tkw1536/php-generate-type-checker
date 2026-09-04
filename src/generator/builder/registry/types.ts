import type { TypeNode } from '../../../parser/ast.ts';

/** Proposes a base PHP function name from a type (no cache or collision handling). */
export interface FunctionNameProposer {
  name(type: TypeNode): string;
}
