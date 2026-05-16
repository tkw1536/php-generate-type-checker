export interface ShapeField {
  key: string | number;
  optional?: boolean;
  type: TypeNode;
}

export interface CallableParam {
  name?: string;
  type: TypeNode;
  optional?: boolean;
  byRef?: boolean;
  variadic?: boolean;
}

export interface CallableSig {
  params: CallableParam[];
  returnType: TypeNode;
}

export type TypeNode =
  | { kind: 'primitive'; name: string }
  /** Bounded integer: optional `min` / `max` omit open sides (`int<min, 100>` → no min, max 100). */
  | { kind: 'int_range'; min?: number; max?: number }
  | { kind: 'array'; key?: TypeNode; value: TypeNode }
  | { kind: 'list'; element: TypeNode; nonEmpty?: boolean }
  | { kind: 'shape'; fields: ShapeField[]; sealed?: boolean; object?: boolean }
  | { kind: 'union'; types: TypeNode[] }
  | { kind: 'intersection'; types: TypeNode[] }
  | { kind: 'generic'; name: string; typeArgs: TypeNode[] }
  | { kind: 'callable'; signature: CallableSig }
  | { kind: 'literal'; value: string | number | boolean }
  | { kind: 'class'; name: string }
  | { kind: 'unsupported'; raw: string; reason?: string };

export function isPrimitiveName(name: string): boolean {
  const primitives = new Set([
    'int',
    'integer',
    'string',
    'float',
    'double',
    'number',
    'numeric',
    'bool',
    'boolean',
    'true',
    'false',
    'null',
    'void',
    'mixed',
    'array',
    'iterable',
    'callable',
    'object',
    'resource',
    'never',
    'noreturn',
    'array-key',
    'scalar',
    'empty',
    'positive-int',
    'negative-int',
    'non-positive-int',
    'non-negative-int',
    'non-zero-int',
    'non-empty-string',
    'non-empty-mixed',
    'class-string',
    'interface-string',
    'trait-string',
    'enum-string',
    'literal-string',
    'numeric-string',
    'callable-string',
    'lowercase-string',
    'uppercase-string',
    'non-falsy-string',
    'truthy-string',
    'decimal-int-string',
    'non-decimal-int-string',
    'non-empty-lowercase-string',
    'non-empty-uppercase-string',
    'non-empty-literal-string',
    'static',
    '$this',
    'self',
    'parent',
  ]);
  return primitives.has(name) || name.includes('-');
}
