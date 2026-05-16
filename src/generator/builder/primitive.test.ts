import { describe, expect, it } from 'vitest';
import { parseType } from '../../parser/index.ts';
import { variableRef } from '../ir/index.ts';
import { isSupportedLeafType } from '../semantics/leaves.ts';
import { singleExprForType } from './primitive.ts';

const $x = variableRef('$x');

describe('isSupportedLeafType', () => {
  it('accepts scalar, iterable, resource', () => {
    expect(isSupportedLeafType(parseType('scalar'))).toBe(true);
    expect(isSupportedLeafType(parseType('iterable'))).toBe(true);
    expect(isSupportedLeafType(parseType('resource'))).toBe(true);
  });

  it('accepts never-family primitives as expressible leaves', () => {
    for (const t of [
      'never',
      'noreturn',
      'never-return',
      'never-returns',
      'no-return',
    ]) {
      expect(isSupportedLeafType(parseType(t))).toBe(true);
    }
  });

  it('rejects literal-string types', () => {
    expect(isSupportedLeafType(parseType('literal-string'))).toBe(false);
    expect(isSupportedLeafType(parseType('non-empty-literal-string'))).toBe(false);
  });
});

describe('singleExprForType (PHPStan string subtypes)', () => {
  const expr = (type: string) => singleExprForType(parseType(type), $x);

  it('scalar', () => {
    expect(expr('scalar')?.kind).toBe('call');
  });

  it('iterable (bare)', () => {
    expect(expr('iterable')).toEqual({ kind: 'call', name: 'is_iterable', args: [{ kind: 'ref', ref: $x }] });
  });

  it('never-family yields false literal', () => {
    expect(expr('never')).toEqual({ kind: 'bool', value: false });
  });

  it('non-empty-string', () => {
    expect(expr('non-empty-string')?.kind).toBe('and');
  });

  it('literal-string is null', () => {
    expect(expr('literal-string')).toBeNull();
  });
});
