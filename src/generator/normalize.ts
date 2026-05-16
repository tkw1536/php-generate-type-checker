import type { TypeNode } from '../parser/ast.ts';

export type ArrayNode = Extract<TypeNode, { kind: 'array' }> & {
  nonEmpty?: boolean;
  /** True when this node was lowered from `iterable<...>` (use `is_iterable`, not `is_array`). */
  iterable?: boolean;
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
  if (name === 'non-empty-list') {
    if (typeArgs.length !== 1) {
      return null;
    }
    return { kind: 'list', element: typeArgs[0], nonEmpty: true };
  }
  if (name === 'list') {
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
    if (typeArgs.length === 0) {
      return { kind: 'primitive', name: 'iterable' };
    }
    if (typeArgs.length === 1) {
      return { kind: 'array', value: typeArgs[0], iterable: true } as ArrayNode;
    }
    if (typeArgs.length === 2) {
      return {
        kind: 'array',
        key: typeArgs[0],
        value: typeArgs[1],
        iterable: true,
      } as ArrayNode;
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
  /**
   * Hyphenated built-ins (`non-empty-list`, …) parse as primitives; bare `non-empty-list`
   * means the same as `non-empty-list<mixed>` (like PHPStan’s list modifier without element type).
   */
  if (node.kind === 'primitive') {
    if (node.name === 'non-empty-list') {
      return normalizeNode({
        kind: 'list',
        element: { kind: 'primitive', name: 'mixed' },
        nonEmpty: true,
      });
    }
    if (node.name === 'non-empty-array') {
      return normalizeNode({
        kind: 'array',
        value: { kind: 'primitive', name: 'mixed' },
        nonEmpty: true,
      } as ArrayNode);
    }
    if (node.name === 'int' || node.name === 'integer') {
      return { kind: 'int_range' };
    }
    if (node.name === 'positive-int') {
      return { kind: 'int_range', min: 1 };
    }
    if (node.name === 'negative-int') {
      return { kind: 'int_range', max: -1 };
    }
    if (node.name === 'non-positive-int') {
      return { kind: 'int_range', max: 0 };
    }
    if (node.name === 'non-negative-int') {
      return { kind: 'int_range', min: 0 };
    }
    if (node.name === 'non-zero-int') {
      return normalizeNode({
        kind: 'union',
        types: [
          { kind: 'int_range', min: 1, max: undefined },
          { kind: 'int_range', min: undefined, max: -1 },
        ],
      });
    }
  }
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
      iterable: (node as ArrayNode).iterable,
    };
    return result;
  }
  if (node.kind === 'list') {
    return {
      kind: 'list',
      element: normalizeNode(node.element),
      nonEmpty: node.nonEmpty,
    };
  }
  if (node.kind === 'shape') {
    const fields = node.fields.map((f) => ({
      ...f,
      type: normalizeNode(f.type),
    }));
    if (fields.length === 0) {
      if (node.object) {
        return { kind: 'primitive', name: 'object' };
      }
      return normalizeNode({
        kind: 'array',
        value: { kind: 'primitive', name: 'never' },
      });
    }
    return {
      kind: 'shape',
      fields,
      sealed: node.sealed,
      object: node.object,
    };
  }
  return node;
}
