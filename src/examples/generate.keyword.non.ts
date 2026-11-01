import type { Keyword } from '../parser/ast.ts';
import {
  CALLABLE_STRING_POOL,
  EMPTY_ARRAY,
  INT_POOL,
  STRING_POOL,
  WRONG_KIND_POOL,
} from './pools.ts';
import {
  phpBool,
  phpInt,
  phpList,
  phpNull,
  phpObjectCast,
  phpString,
  type PhpValue,
} from './phpValue.ts';
import { renderPhpValue } from './render.ts';

const EMPTY: readonly PhpValue[] = [];

/** Counterexamples for a PHPStan keyword type. */
export function nonExamplesForKeyword(keyword: Keyword): readonly PhpValue[] {
  return KEYWORD_NON_EXAMPLES[keyword];
}

function wrongKindExcluding(
  ...kinds: readonly PhpValue['kind'][]
): readonly PhpValue[] {
  const blocked = new Set(kinds);
  return WRONG_KIND_POOL.filter((value) => !blocked.has(value.kind));
}

function filterInt(pred: (n: number) => boolean): readonly PhpValue[] {
  return INT_POOL.filter((v) => v.kind === 'int' && pred(v.value));
}

function filterString(pred: (s: string) => boolean): readonly PhpValue[] {
  return STRING_POOL.filter((v) => v.kind === 'string' && pred(v.value));
}

function withoutRendered(
  pool: readonly PhpValue[],
  blocked: readonly PhpValue[],
): readonly PhpValue[] {
  const keys = new Set(blocked.map((value) => renderPhpValue(value)));
  return pool.filter((value) => !keys.has(renderPhpValue(value)));
}

const NON_ARRAY = wrongKindExcluding('array');
const NON_OBJECT = wrongKindExcluding('objectCast');
const NON_STRING = wrongKindExcluding('string');
const NON_INT = wrongKindExcluding('int');
const NON_BOOL = wrongKindExcluding('bool');
const NON_FLOAT = wrongKindExcluding('float');
const NON_NULL = wrongKindExcluding('null');
const NON_SCALAR = WRONG_KIND_POOL.filter(
  (value) =>
    value.kind === 'null' ||
    value.kind === 'array' ||
    value.kind === 'objectCast',
);

const KEYWORD_NON_EXAMPLES: {
  readonly [K in Keyword]: readonly PhpValue[];
} = {
  int: NON_INT,
  integer: NON_INT,
  'positive-int': [...filterInt((n) => n <= 0), ...NON_INT],
  'negative-int': [...filterInt((n) => n >= 0), ...NON_INT],
  'non-positive-int': [...filterInt((n) => n > 0), ...NON_INT],
  'non-negative-int': [...filterInt((n) => n < 0), ...NON_INT],
  'non-zero-int': [...filterInt((n) => n === 0), ...NON_INT],
  float: [...INT_POOL.slice(0, 2), ...NON_FLOAT],
  double: [...INT_POOL.slice(0, 2), ...NON_FLOAT],
  number: wrongKindExcluding('int', 'float'),
  numeric: wrongKindExcluding('int', 'float'),
  string: NON_STRING,
  'literal-string': NON_STRING,
  // '0' is still non-empty-string in PHPStan; only '' is a string reject.
  'non-empty-string': [phpString(''), ...NON_STRING],
  'non-empty-literal-string': [phpString(''), ...NON_STRING],
  'non-falsy-string': [
    ...filterString((s) => s === '' || s === '0'),
    ...NON_STRING,
  ],
  'truthy-string': [
    ...filterString((s) => s === '' || s === '0'),
    ...NON_STRING,
  ],
  'lowercase-string': [
    ...filterString((s) => s !== s.toLowerCase()),
    ...NON_STRING,
  ],
  'non-empty-lowercase-string': [
    ...filterString((s) => s === '' || s !== s.toLowerCase()),
    ...NON_STRING,
  ],
  'uppercase-string': [
    ...filterString((s) => s !== s.toUpperCase()),
    ...NON_STRING,
  ],
  'non-empty-uppercase-string': [
    ...filterString((s) => s === '' || s !== s.toUpperCase()),
    ...NON_STRING,
  ],
  'numeric-string': [
    phpString('a'),
    phpString('hello'),
    phpString(''),
    ...NON_STRING,
  ],
  'decimal-int-string': [
    phpString('0x10'),
    phpString('a'),
    phpString(''),
    ...NON_STRING,
  ],
  // PHPStan does not prove arbitrary strings as outside non-decimal-int-string.
  'non-decimal-int-string': NON_STRING,
  'callable-string': [
    ...withoutRendered(STRING_POOL, CALLABLE_STRING_POOL),
    ...NON_STRING,
  ],
  'class-string': [phpString('a'), phpString(''), ...NON_STRING],
  // Class names like 'stdClass' still satisfy interface-string under dumpType.
  'interface-string': [phpString('a'), phpString(''), ...NON_STRING],
  'trait-string': NON_STRING,
  // Bare strings stay bool for enum-string; only wrong-kind proves false.
  'enum-string': NON_STRING,
  bool: NON_BOOL,
  boolean: NON_BOOL,
  true: [phpBool(false), ...NON_BOOL],
  false: [phpBool(true), ...NON_BOOL],
  null: NON_NULL,
  mixed: EMPTY,
  'non-empty-mixed': [phpNull(), phpString(''), phpInt(0), phpBool(false), EMPTY_ARRAY],
  'array-key': wrongKindExcluding('int', 'string'),
  scalar: NON_SCALAR,
  array: NON_ARRAY,
  list: NON_ARRAY,
  iterable: NON_ARRAY,
  'non-empty-array': [EMPTY_ARRAY, ...NON_ARRAY],
  'non-empty-list': [EMPTY_ARRAY, ...NON_ARRAY],
  'non-empty-iterable': [EMPTY_ARRAY, ...NON_ARRAY],
  empty: [
    phpInt(1),
    phpString('a'),
    phpBool(true),
    phpList([phpInt(0)]),
    phpObjectCast(),
  ],
  object: NON_OBJECT,
  callable: WRONG_KIND_POOL,
  resource: WRONG_KIND_POOL,
  never: WRONG_KIND_POOL,
  noreturn: WRONG_KIND_POOL,
  void: WRONG_KIND_POOL,
  self: WRONG_KIND_POOL,
  static: WRONG_KIND_POOL,
  parent: WRONG_KIND_POOL,
  $this: WRONG_KIND_POOL,
};
