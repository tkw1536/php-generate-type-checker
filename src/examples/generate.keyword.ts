import type { Keyword } from '../parser/ast.ts';
import {
  BOOL_POOL,
  BUILTIN_CLASS_STRING_POOL,
  CALLABLE_STRING_POOL,
  EMPTY_ARRAY,
  FLOAT_POOL,
  INT_POOL,
  NULL_POOL,
  STRING_POOL,
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

const EMPTY: readonly PhpValue[] = [];

/** Examples for a PHPStan keyword type. */
export function examplesForKeyword(keyword: Keyword): readonly PhpValue[] {
  return KEYWORD_EXAMPLES[keyword];
}

function filterInt(pred: (n: number) => boolean): readonly PhpValue[] {
  return INT_POOL.filter((v) => v.kind === 'int' && pred(v.value));
}

function filterString(pred: (s: string) => boolean): readonly PhpValue[] {
  return STRING_POOL.filter((v) => v.kind === 'string' && pred(v.value));
}

const KEYWORD_EXAMPLES: {
  readonly [K in Keyword]: readonly PhpValue[];
} = {
  int: INT_POOL,
  integer: INT_POOL,
  'positive-int': filterInt((n) => n > 0),
  'negative-int': filterInt((n) => n < 0),
  'non-positive-int': filterInt((n) => n <= 0),
  'non-negative-int': filterInt((n) => n >= 0),
  'non-zero-int': filterInt((n) => n !== 0),
  float: FLOAT_POOL,
  double: FLOAT_POOL,
  number: [...INT_POOL, ...FLOAT_POOL],
  numeric: [...INT_POOL, ...FLOAT_POOL],
  string: STRING_POOL,
  'literal-string': STRING_POOL,
  'non-empty-string': filterString((s) => s !== '' && s !== '0'),
  'non-empty-literal-string': filterString((s) => s !== '' && s !== '0'),
  'non-falsy-string': filterString((s) => s !== '' && s !== '0'),
  'truthy-string': filterString((s) => s !== '' && s !== '0'),
  'lowercase-string': filterString((s) => s === s.toLowerCase()),
  'non-empty-lowercase-string': filterString(
    (s) => s !== '' && s === s.toLowerCase(),
  ),
  'uppercase-string': filterString((s) => s === s.toUpperCase()),
  'non-empty-uppercase-string': filterString(
    (s) => s !== '' && s === s.toUpperCase(),
  ),
  'numeric-string': [phpString('0'), phpString('42'), phpString('-1')],
  'decimal-int-string': [phpString('0'), phpString('42'), phpString('-1')],
  'non-decimal-int-string': [phpString('0x10'), phpString('0b10')],
  'callable-string': CALLABLE_STRING_POOL,
  'class-string': BUILTIN_CLASS_STRING_POOL,
  'interface-string': [
    phpString('Throwable'),
    phpString('DateTimeInterface'),
  ],
  // No stable built-in trait names for PHPStan dumpType proofs.
  'trait-string': EMPTY,
  // PHPStan does not prove bare class-name strings as enum-string.
  'enum-string': EMPTY,
  bool: BOOL_POOL,
  boolean: BOOL_POOL,
  true: [phpBool(true)],
  false: [phpBool(false)],
  null: NULL_POOL,
  mixed: [phpInt(1), phpString('a'), phpBool(true), EMPTY_ARRAY, phpNull()],
  'non-empty-mixed': [
    phpInt(1),
    phpString('a'),
    phpBool(true),
    phpList([phpInt(0)]),
  ],
  'array-key': [...INT_POOL, phpString('a'), phpString('0')],
  scalar: [
    ...INT_POOL.slice(0, 2),
    ...FLOAT_POOL.slice(0, 1),
    ...STRING_POOL.slice(0, 2),
    ...BOOL_POOL,
  ],
  array: [EMPTY_ARRAY, phpList([phpInt(1)]), phpList([phpString('a')])],
  list: [EMPTY_ARRAY, phpList([phpInt(1)]), phpList([phpString('a')])],
  iterable: [EMPTY_ARRAY, phpList([phpInt(1)]), phpList([phpString('a')])],
  'non-empty-array': [phpList([phpInt(1)]), phpList([phpString('a')])],
  'non-empty-list': [phpList([phpInt(1)]), phpList([phpString('a')])],
  'non-empty-iterable': [phpList([phpInt(1)]), phpList([phpString('a')])],
  empty: [EMPTY_ARRAY, phpString(''), phpInt(0), phpBool(false), phpNull()],
  object: [phpObjectCast()],
  callable: EMPTY,
  resource: EMPTY,
  never: EMPTY,
  noreturn: EMPTY,
  void: EMPTY,
  self: EMPTY,
  static: EMPTY,
  parent: EMPTY,
  $this: EMPTY,
};
