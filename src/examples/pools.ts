import {
  phpBool,
  phpFloat,
  phpInt,
  phpList,
  phpNull,
  phpString,
  type PhpValue,
} from './phpValue.ts';

/** Candidate ints for int-like keywords and ranges. */
export const INT_POOL: readonly PhpValue[] = [
  phpInt(0),
  phpInt(1),
  phpInt(-1),
  phpInt(42),
  phpInt(-42),
];

/** Candidate floats. */
export const FLOAT_POOL: readonly PhpValue[] = [
  phpFloat(0),
  phpFloat(1.5),
  phpFloat(-2.5),
  phpFloat(3.14),
];

/** Candidate strings (various emptiness / case flavors). */
export const STRING_POOL: readonly PhpValue[] = [
  phpString(''),
  phpString('a'),
  phpString('hello'),
  phpString('0'),
  phpString('42'),
  phpString('ABC'),
  phpString('abc'),
  phpString('Hello'),
];

export const BOOL_POOL: readonly PhpValue[] = [phpBool(true), phpBool(false)];

/** Built-in class names that exist during PHPStan analyse. */
export const BUILTIN_CLASS_STRING_POOL: readonly PhpValue[] = [
  phpString('stdClass'),
  phpString('Exception'),
  phpString('Throwable'),
  phpString('DateTimeInterface'),
];

/** Strings PHPStan accepts as `callable-string` literals. */
export const CALLABLE_STRING_POOL: readonly PhpValue[] = [
  phpString('strlen'),
  phpString('is_string'),
  phpString('is_int'),
  phpString('array_key_exists'),
];

export const EMPTY_ARRAY: PhpValue = phpList([]);

export const NULL_POOL: readonly PhpValue[] = [phpNull()];
