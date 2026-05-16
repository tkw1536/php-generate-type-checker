import { describe, expect, it } from 'vitest';
import { parseType } from '../parser/index.ts';
import { checksForType } from './checksFromType.ts';
import { renderFailAtom } from './renderCheck.ts';

describe('checksForType', () => {
  it('maps class type to instanceof atom', () => {
    const ast = parseType('DateTimeInterface');
    const [check] = checksForType(ast, '$value', { forFailIf: true });
    expect(check).toEqual({
      kind: 'call',
      function: 'instanceof',
      arguments: ['$value', 'DateTimeInterface'],
      negated: true,
    });
    expect(renderFailAtom(check!)).toBe('!($value instanceof DateTimeInterface)');
  });

  it('maps namespaced class to instanceof atom', () => {
    const ast = parseType('\\Foo\\Bar');
    const [check] = checksForType(ast, '$value', { forFailIf: true });
    expect(check?.kind).toBe('call');
    if (check?.kind === 'call') {
      expect(check.function).toBe('instanceof');
      expect(check.arguments).toEqual(['$value', '\\Foo\\Bar']);
    }
  });

  it('maps int primitive to is_int call', () => {
    const ast = parseType('int');
    const checks = checksForType(ast, '$value', { forFailIf: true });
    expect(checks).toHaveLength(1);
    expect(renderFailAtom(checks[0]!)).toBe('!is_int($value)');
  });
});
