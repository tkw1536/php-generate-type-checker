export type TypeNode =
  // known keyword
  | { kind: 'keyword'; keyword: Keyword }

  // classname (non-keyword)
  | { kind: 'class'; name: string }

  // string literals "hello world", 'hello world'
  | { kind: 'literal'; type: 'string'; value: string, quotes: 'single' | 'double' }

  // numeric literals with exact source. e.g. "42" or "42.0"
  | { kind: 'literal'; type: 'number'; value: string }

  // int<$min, $max> with null meaning a literal "min" or "max"
  | { kind: 'range'; min: number|null; max: number|null, keyword: 'int' | 'integer' } 

  // iterable<value> + variants
  | { kind: 'collection'; value: TypeNode; keyword: 'list' | 'non-empty-list' | 'array' | 'non-empty-array' | 'iterable' | 'non-empty-iterable'}
  // iterable<key, value> + variants
  | { kind: 'collection'; key: TypeNode; value: TypeNode; keyword: 'array' | 'non-empty-array' | 'iterable' | 'non-empty-iterable'}

  // iterable{value1,value2,...} + variants
  | { kind: 'collection'; values: TypeNode[], keyword: 'list' | 'non-empty-list' | 'array' | 'non-empty-array' | 'iterable' | 'non-empty-iterable'}

  // iterable{key1: value1, key2: value2} + variants
  | { kind: 'shape'; fields: ShapeField[], keyword: 'list' | 'non-empty-list' | 'array' | 'non-empty-array' | 'iterable' | 'non-empty-iterable' | 'object' }

  // value[]
  | { kind: 'array'; value: TypeNode }

  // left|right
  | { kind: 'union'; types: TypeNode[] }

  // left&right
  | { kind: 'intersection'; types: TypeNode[] } 

  // callable(params): returnType
  | { kind: 'callable'; signature: CallableSig }

  // Foo<...>
  | { kind: 'generic'; name: string; typeArgs: TypeNode[] }

  // everything not supported by the parser
  | { kind: 'unsupported'; raw: string; reason?: string }; 

export interface ShapeField {
  key: string | number;
  optional: boolean;
  value: TypeNode;
}

export interface CallableParam {
  name?: string;
  type: TypeNode;
  optional: boolean;
  byRef: boolean;
  variadic: boolean;
}

export interface CallableSig {
  params: CallableParam[];
  returnType: TypeNode;
}


export type Keyword = typeof keywords extends Set<infer U> ? U : never;
const keywords = new Set([
  '$this',
  'array-key',
  'array',
  'bool',
  'boolean',
  'callable-string',
  'callable',
  'class-string',
  'decimal-int-string',
  'double',
  'empty',
  'enum-string',
  'false',
  'float',
  'int',
  'integer',
  'interface-string',
  'iterable',
  'list',
  'literal-string',
  'lowercase-string',
  'mixed',
  'negative-int',
  'never',
  'non-decimal-int-string',
  'non-empty-array',
  'non-empty-iterable',
  'non-empty-list',
  'non-empty-literal-string',
  'non-empty-lowercase-string',
  'non-empty-mixed',
  'non-empty-string',
  'non-empty-uppercase-string',
  'non-falsy-string',
  'non-negative-int',
  'non-positive-int',
  'non-zero-int',
  'noreturn',
  'null',
  'number',
  'numeric-string',
  'numeric',
  'object',
  'parent',
  'positive-int',
  'resource',
  'scalar',
  'self',
  'static',
  'string',
  'trait-string',
  'true',
  'truthy-string',
  'uppercase-string',
  'void',
] as const);

export function isKeyword(candidate: string): candidate is Keyword {
  return keywords.has(candidate as Keyword);
}