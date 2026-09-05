import { describe, expect, it } from 'vitest';
import { parseType } from '../../../parser/index.ts';
import { formatType } from '../../../parser/format.ts';
import { createFunctionNameRegistry, FunctionNameRegistry } from './index.ts';

describe('FunctionNameRegistry', () => {
  it('disambiguates different dedupe keys that share the same proposed name', () => {
    const a = parseType('\\Vendor\\A\\Foo');
    const b = parseType('\\Vendor\\B\\Foo');
    const r = createFunctionNameRegistry();
    expect(r.get(a)).toBe('isVendorAFoo');
    expect(formatType(a)).not.toBe(formatType(b));
    expect(r.get(b)).toBe('isVendorBFoo');
  });

  it('returns the same name for the same type', () => {
    const a = parseType('int');
    const r = createFunctionNameRegistry();
    expect(r.get(a)).toBe(r.get(a));
  });

  it('set is idempotent for the same type', () => {
    const n = parseType('int');
    const r = new FunctionNameRegistry();
    r.set(n, 'isCustom');
    r.set(n, 'isCustom');
    expect(r.get(n)).toBe('isCustom');
  });

  it('set entry then get helpers continue with is-style names', () => {
    const r = createFunctionNameRegistry();
    const root = parseType('array<int>|array<string>');
    r.set(root, 'isArrayIntArrayString');
    expect(r.get(parseType('int'))).toBe('isInt');
    expect(r.get(parseType('string'))).toBe('isString');
  });
});
