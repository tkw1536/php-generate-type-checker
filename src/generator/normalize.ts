import type { TypeNode } from '../parser/ast.ts';

export type ArrayNode = Extract<TypeNode, { kind: 'array' }> & {
  nonEmpty?: boolean;
};

/**
 * Map generic nodes to array/list where possible. Returns null if not reducible.
 */
export function normalizeGeneric(
  node: Extract<TypeNode, { kind: 'generic' }>,
): TypeNode | null {
  const { name, typeArgs } = node;

  if (name === 'array') {
    return genericArrayToNode(typeArgs);
  }
  if (name === 'list' || name === 'non-empty-list') {
    if (typeArgs.length !== 1) {
      return null;
    }
    return { kind: 'list', element: typeArgs[0] };
  }
  if (name === 'non-empty-array') {
    if (typeArgs.length !== 1) {
      return null;
    }
    const inner = genericArrayToNode([typeArgs[0]]);
    if (inner?.kind === 'array') {
      return { ...inner, nonEmpty: true } as ArrayNode;
    }
    return null;
  }
  if (name === 'iterable') {
    if (typeArgs.length === 1) {
      return { kind: 'array', value: typeArgs[0] };
    }
    if (typeArgs.length === 2) {
      return { kind: 'array', key: typeArgs[0], value: typeArgs[1] };
    }
    return null;
  }

  return null;
}

function genericArrayToNode(typeArgs: TypeNode[]): TypeNode | null {
  if (typeArgs.length === 1) {
    return { kind: 'array', value: typeArgs[0] };
  }
  if (typeArgs.length === 2) {
    return { kind: 'array', key: typeArgs[0], value: typeArgs[1] };
  }
  return null;
}

export function normalizeNode(node: TypeNode): TypeNode {
  if (node.kind === 'generic') {
    const normalized = normalizeGeneric(node);
    if (normalized) {
      return normalizeNode(normalized);
    }
    return node;
  }
  if (node.kind === 'union') {
    return {
      kind: 'union',
      types: node.types.map(normalizeNode),
    };
  }
  if (node.kind === 'intersection') {
    return {
      kind: 'intersection',
      types: node.types.map(normalizeNode),
    };
  }
  if (node.kind === 'array') {
    const result: ArrayNode = {
      kind: 'array',
      key: node.key ? normalizeNode(node.key) : undefined,
      value: normalizeNode(node.value),
      nonEmpty: (node as ArrayNode).nonEmpty,
    };
    return result;
  }
  if (node.kind === 'list') {
    return { kind: 'list', element: normalizeNode(node.element) };
  }
  if (node.kind === 'shape') {
    return {
      kind: 'shape',
      fields: node.fields.map((f) => ({
        ...f,
        type: normalizeNode(f.type),
      })),
      sealed: node.sealed,
    };
  }
  return node;
}
