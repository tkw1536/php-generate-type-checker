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

export function parsePhpstanTypesFromDocblock(
  source: string,
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
  if (node.kind === 'class' && isAliasReference(node.name, aliases)) {
    return resolveAlias(node.name, aliases, resolvedByName, resolving);
  }

  switch (node.kind) {
    case 'keyword':
    case 'class':
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
      const _exhaustive: never = node;
      return _exhaustive;
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

function isAliasReference(name: string, aliases: Map<string, TypeNode>): boolean {
  return !name.includes('\\') && aliases.has(name);
}

function collectClassReferences(node: TypeNode, out: Set<string>): void {
  if (node.kind === 'class') {
    out.add(node.name);
    return;
  }
  switch (node.kind) {
    case 'keyword':
    case 'literal':
    case 'range':
    case 'unsupported':
    case 'callable':
      return;
    case 'array':
      collectClassReferences(node.value, out);
      return;
    case 'union':
    case 'intersection':
      for (const t of node.types) {
        collectClassReferences(t, out);
      }
      return;
    case 'collection':
      if ('key' in node) {
        collectClassReferences(node.key, out);
      }
      collectClassReferences(node.value, out);
      return;
    case 'shape':
      for (const field of node.fields) {
        collectClassReferences(field.value, out);
      }
      return;
    case 'generic':
      for (const arg of node.typeArgs) {
        collectClassReferences(arg, out);
      }
      return;
    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

/** Returns alias names still referenced as bare class nodes after resolution. */
export function unresolvedAliasReferences(
  ast: TypeNode,
  aliasNames: Iterable<string>,
): string[] {
  const aliasSet = new Set(aliasNames);
  const refs = new Set<string>();
  collectClassReferences(ast, refs);
  return [...refs].filter((name) => !name.includes('\\') && aliasSet.has(name));
}
