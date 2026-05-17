import { describe, expect, it } from 'vitest';
import { parseType } from '../../parser/index.ts';
import { GenerationError } from '../errors.ts';
import { build } from './index.ts';
import type { BuildInput } from './context.ts';

function mockContext(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    resolveCheckerName: () => 'checkNested',
    allocateLoopPair: () => ({ key: '$key1', value: '$value1' }),
    ...overrides,
  };
}

describe('build', () => {
  it('int emits fail-if is_int then return true', () => {
    const program = build(parseType('int'), '$value', mockContext());
    const failIf = program.body.find((s) => s.kind === 'if');
    expect(failIf?.kind).toBe('if');
    if (failIf?.kind === 'if') {
      expect(failIf.cond.kind).toBe('not');
      if (failIf.cond.kind === 'not') {
        expect(failIf.cond.expr.kind).toBe('call');
        if (failIf.cond.expr.kind === 'call') {
          expect(failIf.cond.expr.name).toBe('is_int');
        }
      }
    }
    expect(program.body.some(
      (s) => s.kind === 'return' && s.expr.kind === 'bool' && s.expr.value,
    )).toBe(true);
    expect(program.body.some(
      (s) =>
        s.kind === 'return' &&
        s.expr.kind === 'call' &&
        s.expr.name === 'is_int',
    )).toBe(false);
  });

  it('literal-string throws GenerationError', () => {
    expect(() =>
      build(parseType('literal-string'), '$value', mockContext()),
    ).toThrow(GenerationError);
  });

  it('array<int>|array<string> root union uses fail-if or', () => {
    const program = build(
      parseType('array<int>|array<string>'),
      '$value',
      mockContext(),
    );
    const failIf = program.body[0];
    expect(failIf?.kind).toBe('if');
    if (failIf?.kind === 'if') {
      expect(failIf.cond.kind).toBe('not');
      if (failIf.cond.kind === 'not' && failIf.cond.expr.kind === 'or') {
        expect(failIf.cond.expr.exprs.length).toBeGreaterThanOrEqual(2);
      }
    }
    const last = program.body[program.body.length - 1];
    expect(last?.kind).toBe('return');
    if (last?.kind === 'return') {
      expect(last.expr.kind).toBe('bool');
      if (last.expr.kind === 'bool') {
        expect(last.expr.value).toBe(true);
      }
    }
  });

  it('array<string, int> foreach key uses expression-context fail-if', () => {
    const program = build(
      parseType('array<string, int>'),
      '$value',
      mockContext(),
    );
    const foreachStmt = program.body.find((s) => s.kind === 'foreach');
    expect(foreachStmt?.kind).toBe('foreach');
    if (foreachStmt?.kind === 'foreach') {
      const keyGuard = foreachStmt.body.find((s) => s.kind === 'if');
      expect(keyGuard?.kind).toBe('if');
    }
  });

  it('array<string|null, mixed>|null inline union arms', () => {
    const program = build(
      parseType('array<string|null, mixed>|null'),
      '$value',
      mockContext(),
    );
    expect(program.body.length).toBeGreaterThan(0);
    const failIf = program.body[0];
    expect(failIf?.kind).toBe('if');
  });

  it('never returns false only', () => {
    const program = build(parseType('never'), '$value', mockContext());
    expect(program.body).toEqual([
      { kind: 'return', expr: { kind: 'bool', value: false } },
    ]);
  });

  it('shape list field checks array_is_list on field value', () => {
    const program = build(
      parseType('array{x: list<string>}'),
      '$value',
      mockContext(),
    );
    const stmts = program.body.filter((s) => s.kind === 'if');
    const listGuard = stmts.find(
      (s) =>
        s.kind === 'if' &&
        s.cond.kind === 'not' &&
        s.cond.expr.kind === 'call' &&
        s.cond.expr.name === 'array_is_list',
    );
    expect(listGuard).toBeDefined();
  });
});
