import { describe, expect, it } from 'vitest';
import { emitPrimitiveExpression } from '../generator/simpleTypes.ts';

describe('emitPrimitiveExpression (PHPStan string subtypes)', () => {
  const v = '$x';

  it('scalar', () => {
    expect(emitPrimitiveExpression('scalar', v)).toBe('is_scalar($x)');
  });

  it('iterable (bare)', () => {
    expect(emitPrimitiveExpression('iterable', v)).toBe('is_iterable($x)');
  });

  it('resource', () => {
    expect(emitPrimitiveExpression('resource', v)).toBe('is_resource($x)');
  });

  it('never, noreturn, never-return, never-returns, no-return (uninhabited)', () => {
    for (const name of [
      'never',
      'noreturn',
      'never-return',
      'never-returns',
      'no-return',
    ] as const) {
      expect(emitPrimitiveExpression(name, v)).toBe('false');
    }
  });

  it('empty-scalar and non-empty-scalar (loose compare to false)', () => {
    expect(emitPrimitiveExpression('empty-scalar', v)).toBe(
      '(is_scalar($x) && $x == false)',
    );
    expect(emitPrimitiveExpression('non-empty-scalar', v)).toBe(
      '(is_scalar($x) && $x != false)',
    );
  });

  it('empty and non-empty-mixed (explicit sentinels, not empty())', () => {
    expect(emitPrimitiveExpression('non-empty-mixed', v)).toBe(
      "($x !== false && $x !== 0 && $x !== 0.0 && $x !== '' && $x !== '0' && $x !== [] && $x !== null)",
    );
    expect(emitPrimitiveExpression('empty', v)).toBe(
      "($x === false || $x === 0 || $x === 0.0 || $x === '' || $x === '0' || $x === [] || $x === null)",
    );
  });

  it('callable-string', () => {
    expect(emitPrimitiveExpression('callable-string', v)).toBe(
      '(is_string($x) && is_callable($x))',
    );
  });

  it('callable-object', () => {
    expect(emitPrimitiveExpression('callable-object', v)).toBe(
      '(is_object($x) && is_callable($x))',
    );
  });

  it('callable-array', () => {
    expect(emitPrimitiveExpression('callable-array', v)).toBe(
      '(is_array($x) && is_callable($x))',
    );
  });

  it('array-key (string|int)', () => {
    expect(emitPrimitiveExpression('array-key', v)).toBe(
      '(is_string($x) || is_int($x))',
    );
  });

  it('numeric-string', () => {
    expect(emitPrimitiveExpression('numeric-string', v)).toBe(
      '(is_string($x) && is_numeric($x))',
    );
  });

  it('non-empty-string', () => {
    expect(emitPrimitiveExpression('non-empty-string', v)).toBe(
      "(is_string($x) && $x !== '')",
    );
  });

  it('non-falsy-string and truthy-string', () => {
    const e = "(is_string($x) && $x !== '' && $x !== '0')";
    expect(emitPrimitiveExpression('non-falsy-string', v)).toBe(e);
    expect(emitPrimitiveExpression('truthy-string', v)).toBe(e);
  });

  it('literal-string and non-empty-literal-string are not emitted (uncheckable)', () => {
    expect(emitPrimitiveExpression('literal-string', v)).toBeNull();
    expect(emitPrimitiveExpression('non-empty-literal-string', v)).toBeNull();
  });

  it('lowercase-string and uppercase-string', () => {
    expect(emitPrimitiveExpression('lowercase-string', v)).toBe(
      '(is_string($x) && strtolower($x) === $x)',
    );
    expect(emitPrimitiveExpression('uppercase-string', v)).toBe(
      '(is_string($x) && strtoupper($x) === $x)',
    );
  });

  it('decimal-int-string and non-decimal-int-string', () => {
    expect(emitPrimitiveExpression('decimal-int-string', v)).toBe(
      "(is_string($x) && preg_match('/^-?(?:0|[1-9]\\d*)$/', $x) === 1)",
    );
    expect(emitPrimitiveExpression('non-decimal-int-string', v)).toBe(
      "(is_string($x) && preg_match('/^-?(?:0|[1-9]\\d*)$/', $x) !== 1)",
    );
  });

  it('combined non-empty * string types', () => {
    expect(emitPrimitiveExpression('non-empty-lowercase-string', v)).toBe(
      "(is_string($x) && $x !== '' && strtolower($x) === $x)",
    );
    expect(emitPrimitiveExpression('non-empty-uppercase-string', v)).toBe(
      "(is_string($x) && $x !== '' && strtoupper($x) === $x)",
    );
  });
});
