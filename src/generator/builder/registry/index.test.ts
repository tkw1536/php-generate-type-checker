import { describe, expect, it } from 'vitest';
import { parseType } from '../../../parser/index.ts';
import { formatType } from '../../../parser/format.ts';
import { IsStyleFunctionNameProposer, SequentialCheckNameProposer } from './proposer.ts';
import { FunctionNameRegistry } from './index.ts';

describe('FunctionNameRegistry', () => {
  it('disambiguates different dedupe keys that share the same proposed name', () => {
    const a = parseType('\\Vendor\\A\\Foo');
    const b = parseType('\\Vendor\\B\\Foo');
    const r = new FunctionNameRegistry(new IsStyleFunctionNameProposer());
    expect(r.get(a)).toBe('isFoo');
    expect(formatType(a)).not.toBe(formatType(b));
    expect(r.get(b)).toBe('isFoo_2');
  });

  it('returns the same name for the same type', () => {
    const a = parseType('int');
    const r = new FunctionNameRegistry(new IsStyleFunctionNameProposer());
    expect(r.get(a)).toBe(r.get(a));
  });

  it('set is idempotent for the same type', () => {
    const n = parseType('int');
    const r = new FunctionNameRegistry(new IsStyleFunctionNameProposer());
    r.set(n, 'isCustom');
    r.set(n, 'isCustom');
    expect(r.get(n)).toBe('isCustom');
  });

  it('set entry check then get helpers for legacy naming', () => {
    const r = new FunctionNameRegistry(new SequentialCheckNameProposer());
    const root = parseType('array<int>|array<string>');
    r.set(root, 'check');
    expect(r.get(parseType('int'))).toBe('check_1');
    expect(r.get(parseType('string'))).toBe('check_2');
  });
});
