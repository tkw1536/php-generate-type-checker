import type { TypeNode } from './ast.ts';

export class TypeAliasResolveError extends Error {
  readonly aliasName?: string;

  constructor(message: string, aliasName?: string) {
    super(message);
    this.name = 'TypeAliasResolveError';
    this.aliasName = aliasName;
  }
}

export function validateAliasGraph(
  defs: readonly { readonly name: string; readonly ast: TypeNode }[],
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

export function collectNamedAliasReferences(
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
    default:
      throw new Error('never reached');
  }
}

export function isBareAliasReference(
  name: string,
  aliasNames: Set<string> | Map<string, TypeNode>,
): boolean {
  return !name.includes('\\') && aliasNames.has(name);
}
