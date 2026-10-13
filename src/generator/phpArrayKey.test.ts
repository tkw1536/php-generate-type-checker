import { describe, expect, it } from 'vitest';
import { generateChecker } from './index.ts';
import { phpArrayKeyLiteral, phpCastsStringKeyToInt } from './phpArrayKey.ts';

describe('phpCastsStringKeyToInt', () => {
  it('accepts decimal int strings in PHP int range', () => {
    expect(phpCastsStringKeyToInt('0')).toBe(true);
    expect(phpCastsStringKeyToInt('123')).toBe(true);
    expect(phpCastsStringKeyToInt('-42')).toBe(true);
  });

  it('rejects non-decimal and out-of-range keys', () => {
    expect(phpCastsStringKeyToInt('08')).toBe(false);
    expect(phpCastsStringKeyToInt('+1')).toBe(false);
    expect(phpCastsStringKeyToInt('1.5')).toBe(false);
    expect(phpCastsStringKeyToInt('foo')).toBe(false);
    expect(phpCastsStringKeyToInt('9223372036854775808')).toBe(false);
  });
});

describe('phpArrayKeyLiteral', () => {
  it('emits ints for numbers and decimal-int-strings', () => {
    expect(phpArrayKeyLiteral(0)).toBe('0');
    expect(phpArrayKeyLiteral(123)).toBe('123');
    expect(phpArrayKeyLiteral('123')).toBe('123');
    expect(phpArrayKeyLiteral('-7')).toBe('-7');
  });

  it('quotes non-castable string keys', () => {
    expect(phpArrayKeyLiteral('08')).toBe("'08'");
    expect(phpArrayKeyLiteral('field-one')).toBe("'field-one'");
  });
});

describe('generateChecker decimal-int string shape keys', () => {
  it('uses int literals for access and key compares', () => {
    const php = generateChecker("array{'123': int, '08'?: string}", {
      sealArrayShapes: true,
    });
    expect(php).toContain('array_key_exists(123, $value)');
    expect(php).toContain('is_int($value[123])');
    expect(php).toContain("array_key_exists('08', $value)");
    expect(php).toContain("is_string($value['08'])");
    expect(php).toContain('$key !== 123');
    expect(php).toContain("$key !== '08'");
  });
});
