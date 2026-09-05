export type TypeNode =
  // known keyword
  | { readonly kind: 'keyword'; readonly keyword: Keyword }

  // class name or alias reference — resolved at codegen (alias entry checker vs instanceof)
  | { readonly kind: 'named'; readonly name: string }

  // string literals "hello world", 'hello world'
  | { readonly kind: 'literal'; readonly type: 'string'; readonly value: string; readonly quotes: 'single' | 'double' }

  // numeric literals with exact source. e.g. "42" or "42.0"
  | { readonly kind: 'literal'; readonly type: 'number'; readonly value: string }

  // int<$min, $max> with null meaning a literal "min" or "max"
  | { readonly kind: 'range'; readonly min: number | null; readonly max: number | null; readonly keyword: 'int' | 'integer' }

  // iterable<value> + variants
  | { readonly kind: 'collection'; readonly value: TypeNode; readonly keyword: 'list' | 'non-empty-list' | 'array' | 'non-empty-array' | 'iterable' | 'non-empty-iterable' }
  // iterable<key, value> + variants
  | { readonly kind: 'collection'; readonly key: TypeNode; readonly value: TypeNode; readonly keyword: 'array' | 'non-empty-array' | 'iterable' | 'non-empty-iterable' }

  // iterable{…} + variants — positional slots use {@link ShapeField} with `key: null`; named slots use string | number keys
  | { readonly kind: 'shape'; readonly fields: readonly ShapeField[]; readonly keyword: 'list' | 'non-empty-list' | 'array' | 'non-empty-array' | 'iterable' | 'non-empty-iterable' | 'object' }

  // value[]
  | { readonly kind: 'array'; readonly value: TypeNode }

  // left|right
  | { readonly kind: 'union'; readonly types: readonly TypeNode[] }

  // left&right
  | { readonly kind: 'intersection'; readonly types: readonly TypeNode[] }

  // callable(params): returnType
  | { readonly kind: 'callable'; readonly signature: CallableSig }

  // Foo<...>
  | { readonly kind: 'generic'; readonly name: string; readonly typeArgs: readonly TypeNode[] }

  // everything not supported by the parser
  | { readonly kind: 'unsupported'; readonly raw: string; readonly reason?: string };

export interface ShapeField {
  /** `null` = positional / tuple slot (no `key:` in source); otherwise the shape field name or numeric index. */
  readonly key: string | number | null;
  readonly optional: boolean;
  readonly value: TypeNode;
}

export interface CallableParam {
  readonly name?: string;
  readonly type: TypeNode;
  readonly optional: boolean;
  readonly byRef: boolean;
  readonly variadic: boolean;
}

export interface CallableSig {
  readonly params: readonly CallableParam[];
  readonly returnType: TypeNode;
}


export type Keyword = (typeof KEYWORD_VALUES)[number];
const KEYWORD_VALUES = [
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
] as const;
const keywords: ReadonlySet<string> = new Set(KEYWORD_VALUES);

/** True if `candidate` is already the canonical (lowercase) keyword spelling. */
export function isKeyword(candidate: string): candidate is Keyword {
  return keywords.has(candidate);
}

/**
 * Map a PHPStan builtin / keyword identifier to its canonical lowercase form.
 * Case-insensitive: `TRue` → `true`, `non-FALSY-string` → `non-falsy-string`.
 * Returns `null` when `candidate` is not a known keyword.
 */
export function canonicalKeyword(candidate: string): Keyword | null {
  const lower = candidate.toLowerCase();
  return isKeyword(lower) ? lower : null;
}
