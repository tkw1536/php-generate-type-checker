import { describe, expect, it } from 'vitest';
import type { CheckerProgram } from './checkerIR.ts';
import { formatCheckerProgram } from './checkerIR.ts';
import { optimizeCheckerIR } from './normalizeCheckerIR.ts';

describe('optimizeCheckerIR', () => {
  it('hoists failIf before foreach', () => {
    const program: CheckerProgram = {
      parameter: '$value',
      statements: [
        {
          kind: 'foreach',
          iterable: { kind: 'parameter' },
          loopId: 'loop1',
          keyVar: null,
          valueVar: '$value1',
          body: [
            {
              kind: 'failIf',
              check: {
                kind: 'call',
                function: 'is_string',
                arguments: ['$value1'],
                negated: true,
              },
            },
          ],
        },
        {
          kind: 'failIf',
          check: {
            kind: 'call',
            function: 'is_array',
            arguments: ['$value'],
            negated: true,
          },
        },
        { kind: 'returnTrue' },
      ],
    };
    const optimized = optimizeCheckerIR(program, {
      preserveStatementOrder: false,
    });
    expect(optimized.statements[0]?.kind).toBe('failIf');
    expect(optimized.statements[1]?.kind).toBe('foreach');
    expect(optimized.statements[2]?.kind).toBe('returnTrue');
  });

  it('dedupes identical failIf checks', () => {
    const program: CheckerProgram = {
      parameter: '$value',
      statements: [
        {
          kind: 'failIf',
          check: {
            kind: 'call',
            function: 'is_array',
            arguments: ['$value'],
            negated: true,
          },
        },
        {
          kind: 'failIf',
          check: {
            kind: 'call',
            function: 'is_array',
            arguments: ['$value'],
            negated: true,
          },
        },
        { kind: 'returnTrue' },
      ],
    };
    const optimized = optimizeCheckerIR(program);
    const failIfs = optimized.statements.filter((s) => s.kind === 'failIf');
    expect(failIfs).toHaveLength(1);
    expect(formatCheckerProgram(optimized)).toContain('is_array');
  });

  it('preserves statement order when preserveStatementOrder is true', () => {
    const program: CheckerProgram = {
      parameter: '$value',
      statements: [
        {
          kind: 'foreach',
          iterable: { kind: 'parameter' },
          loopId: 'loop1',
          keyVar: null,
          valueVar: '$value1',
          body: [],
        },
        {
          kind: 'failIf',
          check: {
            kind: 'call',
            function: 'is_array',
            arguments: ['$value'],
            negated: true,
          },
        },
        { kind: 'returnTrue' },
      ],
    };
    const optimized = optimizeCheckerIR(program, {
      preserveStatementOrder: true,
    });
    expect(optimized.statements[0]?.kind).toBe('foreach');
    expect(optimized.statements[1]?.kind).toBe('failIf');
  });
});
