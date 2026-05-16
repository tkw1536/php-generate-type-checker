import { describe, expect, it } from 'vitest';
import type { CheckerProgram } from './checkerIR.ts';
import { emitCheckerIR } from './emitCheckerIR.ts';
import { optimizeCheckerIR } from './normalizeCheckerIR.ts';
import { formatBody } from './context.ts';

/** Built-stage IR for `array{hello: string, world: list<string>}` (guards before foreach). */
const shapeListBuilt: CheckerProgram = {
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
        function: 'array_key_exists',
        arguments: ["'hello'", '$value'],
        negated: true,
      },
    },
    {
      kind: 'failIf',
      check: {
        kind: 'call',
        function: 'is_string',
        arguments: ["$value['hello']"],
        negated: true,
      },
    },
    {
      kind: 'failIf',
      check: {
        kind: 'call',
        function: 'array_key_exists',
        arguments: ["'world'", '$value'],
        negated: true,
      },
    },
    {
      kind: 'failIf',
      check: {
        kind: 'call',
        function: 'is_array',
        arguments: ["$value['world']"],
        negated: true,
      },
    },
    {
      kind: 'failIf',
      check: {
        kind: 'call',
        function: 'array_is_list',
        arguments: ["$value['world']"],
        negated: true,
      },
    },
    {
      kind: 'foreach',
      iterable: {
        kind: 'access',
        base: { kind: 'parameter' },
        field: { kind: 'arrayIndex', key: 'world' },
      },
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
    { kind: 'returnTrue' },
  ],
};

describe('emitCheckerIR', () => {
  it('batches consecutive top-level failIf guards in compact mode', () => {
    const optimized = optimizeCheckerIR(shapeListBuilt);
    const body = formatBody(
      emitCheckerIR(optimized, { prioritizeReadabilityOverCompactness: false }),
    );
    expect(body).toContain('if (!is_array($value)');
    expect(body).toContain("|| !array_key_exists('hello', $value)");
    expect(body).toContain("foreach ($value['world'] as $value1)");
    expect(body).toContain('return true;');
  });

  it('emits one if per failIf in readability mode', () => {
    const optimized = optimizeCheckerIR(shapeListBuilt, {
      preserveStatementOrder: true,
    });
    const body = formatBody(
      emitCheckerIR(optimized, { prioritizeReadabilityOverCompactness: true }),
    );
    const guardCount = (body.match(/if \(!/g) ?? []).length;
    expect(guardCount).toBeGreaterThan(2);
  });
});
