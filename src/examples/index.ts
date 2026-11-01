import type { TypeNode } from '../parser/ast.ts';
import {
  counterexampleExpressions,
  exampleExpressions,
  packExamplesPhp,
  type PackExamplesOptions,
} from './pack.ts';

/** Convenience: generate + render example expressions for a type AST. */
export function renderExamples(ast: TypeNode): readonly string[] {
  return exampleExpressions(ast);
}

/** Convenience: generate + render counterexample expressions for a type AST. */
export function renderCounterexamples(ast: TypeNode): readonly string[] {
  return counterexampleExpressions(ast);
}

/**
 * Pack a single-type PHPStan harness.
 * `null` omits (unresolved / RequireClass); `''` means no values to emit.
 */
export function formatExamplesHarness(
  ast: TypeNode,
  options: PackExamplesOptions,
): string | null {
  return packExamplesPhp(ast, options);
}
