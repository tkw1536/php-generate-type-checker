import type { ShapeField, TypeNode } from './ast.ts';
import {
  TypeAliasResolveError,
  collectNamedAliasReferences,
  isBareAliasReference,
} from './aliasGraph.ts';

export function resolveAlias(
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

export function substituteAliases(
  node: TypeNode,
  aliases: Map<string, TypeNode>,
  resolvedByName: Map<string, TypeNode>,
  resolving: Set<string>,
): TypeNode {
  if (node.kind === 'named' && isBareAliasReference(node.name, aliases)) {
    return resolveAlias(node.name, aliases, resolvedByName, resolving);
  }
  return substituteComposite(node, aliases, resolvedByName, resolving);
}

function substituteComposite(
  node: TypeNode,
  aliases: Map<string, TypeNode>,
  resolvedByName: Map<string, TypeNode>,
  resolving: Set<string>,
): TypeNode {
  const sub = (t: TypeNode): TypeNode =>
    substituteAliases(t, aliases, resolvedByName, resolving);

  switch (node.kind) {
    case 'keyword':
    case 'named':
    case 'literal':
    case 'range':
    case 'unsupported':
    case 'callable':
      return node;
    case 'array':
      return { kind: 'array', value: sub(node.value) };
    case 'union':
      return { kind: 'union', types: node.types.map(sub) };
    case 'intersection':
      return { kind: 'intersection', types: node.types.map(sub) };
    case 'collection':
      return substituteCollection(node, sub);
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
        typeArgs: node.typeArgs.map(sub),
      };
    default:
      throw new Error('never reached');
  }
}

function substituteCollection(
  node: Extract<TypeNode, { kind: 'collection' }>,
  sub: (t: TypeNode) => TypeNode,
): TypeNode {
  if ('key' in node) {
    return {
      kind: 'collection',
      keyword: node.keyword,
      key: sub(node.key),
      value: sub(node.value),
    };
  }
  return {
    kind: 'collection',
    keyword: node.keyword,
    value: sub(node.value),
  };
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

/** Returns alias names referenced as bare `named` nodes in an AST. */
export function namedAliasReferences(
  ast: TypeNode,
  aliasNames: Iterable<string>,
): string[] {
  const aliasSet = new Set(aliasNames);
  const refs = collectNamedAliasReferences(ast, aliasSet);
  return [...refs].toSorted();
}
