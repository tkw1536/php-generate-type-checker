import type { TypeNode } from '../parser/ast.ts';
import { exampleExpressions } from './pack.ts';
import {
  packExamplesPhp,
  type PackExamplesOptions,
} from './pack.ts';

/** Convenience: generate + render example expressions for a type AST. */
export function renderExamples(ast: TypeNode): readonly string[] {
  return exampleExpressions(ast);
}

/** Pack a single-type PHPStan harness, or `null` to omit (unresolved / RequireClass). */
export function formatExamplesHarness(
  ast: TypeNode,
  options: PackExamplesOptions,
): string | null {
  return packExamplesPhp(ast, options);
}
