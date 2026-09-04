import type { ShapeField, TypeNode } from './ast.ts';
import { extractPhpstanTypes } from './phpstanTypeDocblock.ts';
import { ParseError, parseType } from './parser.ts';

export class TypeAliasResolveError extends Error {
  readonly aliasName?: string;

  constructor(message: string, aliasName?: string) {
    super(message);
    this.name = 'TypeAliasResolveError';
    this.aliasName = aliasName;
  }
}

export type ResolvedPhpstanType = {
  name: string;
  typeString: string;
  ast: TypeNode;
};

export type ParsePhpstanTypesFromDocblockOptions = {
  /** When true, inline alias cross-references into each alias body. Default: false (keep named nodes). */
  resolveAliases?: boolean;
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

  if (!options?.resolveAliases) {
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

function resolveAlias(
  name: string,
  rawByName: Map<string, TypeNode>,
  resolvedByName: Map<string, TypeNode>,
  resolving: Set<string>,
): TypeNode {
  const cached = resolvedByName.get(name);
  if (cached !== undefined) {
    return cached;
  }

  const raw = rawByName.get(name);
  if (raw === undefined) {
    throw new TypeAliasResolveError(`Unknown alias "${name}"`, name);
  }

  if (resolving.has(name)) {
    throw new TypeAliasResolveError(
      `Circular @phpstan-type reference involving "${name}"`,
      name,
    );
  }

  resolving.add(name);
  const resolved = substituteAliases(
    raw,
    rawByName,
    resolvedByName,
    resolving,
  );
  resolving.delete(name);
  resolvedByName.set(name, resolved);
  return resolved;
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

function substituteAliases(
  node: TypeNode,
  aliases: Map<string, TypeNode>,
  resolvedByName: Map<string, TypeNode>,
  resolving: Set<string>,
): TypeNode {
  if (node.kind === 'named' && isBareAliasReference(node.name, aliases)) {
    return resolveAlias(node.name, aliases, resolvedByName, resolving);
  }

  switch (node.kind) {
    case 'keyword':
    case 'named':
    case 'literal':
    case 'range':
    case 'unsupported':
    case 'callable':
      return node;
    case 'array':
      return {
        kind: 'array',
        value: substituteAliases(
          node.value,
          aliases,
          resolvedByName,
          resolving,
        ),
      };
    case 'union':
      return {
        kind: 'union',
        types: node.types.map((t) =>
          substituteAliases(t, aliases, resolvedByName, resolving),
        ),
      };
    case 'intersection':
      return {
        kind: 'intersection',
        types: node.types.map((t) =>
          substituteAliases(t, aliases, resolvedByName, resolving),
        ),
      };
    case 'collection':
      if ('key' in node) {
        return {
          kind: 'collection',
          keyword: node.keyword,
          key: substituteAliases(node.key, aliases, resolvedByName, resolving),
          value: substituteAliases(
            node.value,
            aliases,
            resolvedByName,
            resolving,
          ),
        };
      }
      return {
        kind: 'collection',
        keyword: node.keyword,
        value: substituteAliases(node.value, aliases, resolvedByName, resolving),
      };
    case 'shape':
      return {
        kind: 'shape',
        keyword: node.keyword,
        fields: node.fields.map((field) =>
          substituteShapeField(field, aliases, resolvedByName, resolving),
        ),
      };
    case 'generic':
      return {
        kind: 'generic',
        name: node.name,
        typeArgs: node.typeArgs.map((t) =>
          substituteAliases(t, aliases, resolvedByName, resolving),
        ),
      };
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

function substituteShapeField(
  field: ShapeField,
  aliases: Map<string, TypeNode>,
  resolvedByName: Map<string, TypeNode>,
  resolving: Set<string>,
): ShapeField {
  return {
    ...field,
    value: substituteAliases(field.value, aliases, resolvedByName, resolving),
  };
}

function validateAliasGraph(
  defs: { name: string; ast: TypeNode }[],
): void {
  const aliasNames = new Set(defs.map((def) => def.name));
  const graph = new Map<string, Set<string>>();

  for (const def of defs) {
    graph.set(def.name, collectNamedAliasReferences(def.ast, aliasNames));
  }

  for (const name of aliasNames) {
    detectCycle(name, graph, new Set(), new Set());
  }
}

function detectCycle(
  name: string,
  graph: Map<string, Set<string>>,
  visiting: Set<string>,
  visited: Set<string>,
): void {
  if (visited.has(name)) {
    return;
  }
  if (visiting.has(name)) {
    throw new TypeAliasResolveError(
      `Circular @phpstan-type reference involving "${name}"`,
      name,
    );
  }

  visiting.add(name);
  for (const dep of graph.get(name) ?? []) {
    detectCycle(dep, graph, visiting, visited);
  }
  visiting.delete(name);
  visited.add(name);
}

function collectNamedAliasReferences(
  node: TypeNode,
  aliasNames: Set<string>,
): Set<string> {
  const out = new Set<string>();
  walkNamedAliasReferences(node, aliasNames, out);
  return out;
}

function walkNamedAliasReferences(
  node: TypeNode,
  aliasNames: Set<string>,
  out: Set<string>,
): void {
  if (node.kind === 'named' && isBareAliasReference(node.name, aliasNames)) {
    out.add(node.name);
    return;
  }

  switch (node.kind) {
    case 'keyword':
    case 'named':
    case 'literal':
    case 'range':
    case 'unsupported':
    case 'callable':
      return;
    case 'array':
      walkNamedAliasReferences(node.value, aliasNames, out);
      return;
    case 'union':
    case 'intersection':
      for (const member of node.types) {
        walkNamedAliasReferences(member, aliasNames, out);
      }
      return;
    case 'collection':
      if ('key' in node) {
        walkNamedAliasReferences(node.key, aliasNames, out);
      }
      walkNamedAliasReferences(node.value, aliasNames, out);
      return;
    case 'shape':
      for (const field of node.fields) {
        walkNamedAliasReferences(field.value, aliasNames, out);
      }
      return;
    case 'generic':
      for (const arg of node.typeArgs) {
        walkNamedAliasReferences(arg, aliasNames, out);
      }
      return;
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

function isBareAliasReference(
  name: string,
  aliasNames: Set<string> | Map<string, TypeNode>,
): boolean {
  return !name.includes('\\') && aliasNames.has(name);
}

/** Returns alias names referenced as bare `named` nodes in an AST. */
export function namedAliasReferences(
  ast: TypeNode,
  aliasNames: Iterable<string>,
): string[] {
  const aliasSet = new Set(aliasNames);
  const refs = collectNamedAliasReferences(ast, aliasSet);
  return [...refs].toSorted();
}
