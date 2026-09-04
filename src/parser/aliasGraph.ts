import type { TypeNode } from './ast.ts';

export class TypeAliasResolveError extends Error {
  readonly aliasName?: string;
  /** Absolute offset of a reference call site in the input, when known. */
  readonly pos?: number;

  constructor(message: string, aliasName?: string, pos?: number) {
    super(message);
    this.name = 'TypeAliasResolveError';
    this.aliasName = aliasName;
    this.pos = pos;
  }
}

export type AliasGraphDef = {
  readonly name: string;
  readonly ast: TypeNode;
  /** Absolute start of this alias's type body (reference call-site location). */
  readonly typeStart?: number;
};

export function validateAliasGraph(defs: readonly AliasGraphDef[]): void {
  const aliasNames = new Set(defs.map((def) => def.name));
  const graph = new Map<string, Set<string>>();
  const typeStartByName = new Map<string, number>();

  for (const def of defs) {
    graph.set(def.name, collectNamedAliasReferences(def.ast, aliasNames));
    if (def.typeStart !== undefined) {
      typeStartByName.set(def.name, def.typeStart);
    }
  }

  for (const name of aliasNames) {
    detectCycle(name, graph, typeStartByName, new Set(), new Set());
  }
}

function detectCycle(
  name: string,
  graph: Map<string, Set<string>>,
  typeStartByName: ReadonlyMap<string, number>,
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
      typeStartByName.get(name),
    );
  }

  visiting.add(name);
  for (const dep of graph.get(name) ?? []) {
    if (visiting.has(dep)) {
      // Call site: `dep` is referenced from `name`'s type body.
      throw new TypeAliasResolveError(
        `Circular @phpstan-type reference involving "${dep}"`,
        dep,
        typeStartByName.get(name),
      );
    }
    detectCycle(dep, graph, typeStartByName, visiting, visited);
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
