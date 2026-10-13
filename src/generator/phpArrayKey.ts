/** Matches PHPStan decimal-int-string (keys PHP casts to int when in range). */
const DECIMAL_INT_STRING_KEY = /^-?(?:0|[1-9]\d*)$/u;

/** 64-bit PHP_INT_MIN / PHP_INT_MAX (keys outside this stay strings). */
const PHP_INT_MIN = -9223372036854775808n;
const PHP_INT_MAX = 9223372036854775807n;

/**
 * True when PHP would cast this string to int when used as an array key.
 * Leading zeros (`'08'`), `'+1'`, etc. stay strings.
 */
export function phpCastsStringKeyToInt(key: string): boolean {
  if (!DECIMAL_INT_STRING_KEY.test(key)) {
    return false;
  }
  const n = BigInt(key);
  return n >= PHP_INT_MIN && n <= PHP_INT_MAX;
}

/**
 * PHP source literal for an array key in `array_key_exists` / `$a[$k]` /
 * foreach key compares. Decimal-int-strings become int literals.
 */
export function phpArrayKeyLiteral(key: string | number): string {
  if (typeof key === 'number') {
    return String(key);
  }
  if (phpCastsStringKeyToInt(key)) {
    return key;
  }
  return `'${key.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}
