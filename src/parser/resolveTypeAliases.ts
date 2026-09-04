import type { TypeNode } from './ast.ts';
import { TypeAliasResolveError, validateAliasGraph } from './aliasGraph.ts';
import { extractPhpstanTypes } from './phpstanTypeDocblock.ts';
import { ParseError, parseType } from './parser.ts';
import {
  namedAliasReferences,
  resolveAlias,
  substituteAliases,
} from './substituteAliases.ts';

export { TypeAliasResolveError, namedAliasReferences };

export type ResolvedPhpstanType = {
  readonly name: string;
  readonly typeString: string;
  readonly ast: TypeNode;
};

export type ParsePhpstanTypesFromDocblockOptions = {
  /** When true, inline alias cross-references into each alias body. Default: false (keep named nodes). */
  readonly resolveAliases?: boolean;
};

export function parsePhpstanTypesFromDocblock(
  source: string,
  options?: ParsePhpstanTypesFromDocblockOptions,
): ResolvedPhpstanType[] {
  const defs = extractPhpstanTypes(source);
  const rawByName = new Map<string, TypeNode>();

  for (const [index, def] of defs.entries()) {
    try {
      rawByName.set(def.name, parseType(def.typeString));
    } catch (err) {
      if (err instanceof ParseError) {
        throw new ParseError(err.message, err.pos, index);
      }
      throw err;
    }
  }

  validateAliasGraph(
    defs.map((def) => ({
      name: def.name,
      ast: rawByName.get(def.name)!,
    })),
  );

  if (options?.resolveAliases !== true) {
    return defs.map((def) => ({
      name: def.name,
      typeString: def.typeString,
      ast: rawByName.get(def.name)!,
    }));
  }

  const resolvedByName = new Map<string, TypeNode>();
  const resolving = new Set<string>();

  for (const def of defs) {
    resolveAlias(def.name, rawByName, resolvedByName, resolving);
  }

  return defs.map((def) => ({
    name: def.name,
    typeString: def.typeString,
    ast: resolvedByName.get(def.name)!,
  }));
}

/** Inline alias cross-references in an AST using the given alias map. */
export function resolveTypeAliases(
  ast: TypeNode,
  aliases: Map<string, TypeNode>,
): TypeNode {
  const resolvedByName = new Map<string, TypeNode>();
  const resolving = new Set<string>();
  return substituteAliases(ast, aliases, resolvedByName, resolving);
}
