import { describe, expect, it } from 'vitest';
import { instanceofCheck } from '../checkerIR.ts';
import { renderAtom, renderFailAtom } from './renderCheck.ts';

describe('renderCheck', () => {
  it('renders instanceof call', () => {
    const check = instanceofCheck('$value', 'DateTimeInterface', true);
    expect(renderAtom({ ...check, negated: false })).toBe(
      '$value instanceof DateTimeInterface',
    );
    expect(renderFailAtom(check)).toBe('!($value instanceof DateTimeInterface)');
  });

  it('renders is_array failIf atom', () => {
    const check = {
      kind: 'call' as const,
      function: 'is_array',
      arguments: ['$value'],
      negated: true,
    };
    expect(renderFailAtom(check)).toBe('!is_array($value)');
    expect(renderAtom(check)).toBe('is_array($value)');
  });

  it('renders equals', () => {
    const check = {
      kind: 'equals' as const,
      variable: '$value',
      literal: '[]',
      negated: false,
    };
    expect(renderFailAtom(check)).toBe('$value === []');
  });
});
