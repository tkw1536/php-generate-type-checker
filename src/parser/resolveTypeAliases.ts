import type { TypeNode } from './ast.ts';
import {
  substituteAliases,
} from './substituteAliases.ts';

/** Inline alias cross-references in an AST using the given alias map. */
export function resolveTypeAliases(
  ast: TypeNode,
  aliases: Map<string, TypeNode>,
): TypeNode {
  const resolvedByName = new Map<string, TypeNode>();
  const resolving = new Set<string>();
  return substituteAliases(ast, aliases, resolvedByName, resolving);
}
