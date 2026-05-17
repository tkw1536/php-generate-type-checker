import { describe, expect, it } from 'vitest';
import {
  boolLit,
  callExpr,
  failIfStmt,
  notExpr,
  orExpr,
  refArg,
  variableRef,
} from '../ir/index.ts';
import type { Block } from '../ir/types.ts';
import { combine } from './combine.ts';

const $v = variableRef('$value');
const isArray = callExpr('is_array', [refArg($v)]);
const isInt = callExpr('is_int', [refArg($v)]);
const isString = callExpr('is_string', [refArg($v)]);

describe('combine', () => {
  it.each([
    [
      'merges consecutive ifs with same body',
      [failIfStmt(isArray), failIfStmt(isInt)],
      [
        {
          kind: 'if' as const,
          cond: orExpr([notExpr(isArray), notExpr(isInt)]),
          body: [{ kind: 'return' as const, expr: boolLit(false) }],
        },
      ],
    ],
    [
      'leaves single if unchanged',
      [failIfStmt(isArray)],
      [failIfStmt(isArray)],
    ],
    [
      'stops at non-if',
      [
        failIfStmt(isArray),
        {
          kind: 'foreach' as const,
          iterable: $v,
          keyVar: null,
          valueVar: '$elem',
          body: [],
        },
        failIfStmt(isInt),
      ],
      [
        failIfStmt(isArray),
        {
          kind: 'foreach' as const,
          iterable: $v,
          keyVar: null,
          valueVar: '$elem',
          body: [],
        },
        failIfStmt(isInt),
      ],
    ],
    [
      'merges three ifs with same body',
      [failIfStmt(isArray), failIfStmt(isInt), failIfStmt(isString)],
      [
        {
          kind: 'if' as const,
          cond: orExpr([
            notExpr(isArray),
            notExpr(isInt),
            notExpr(isString),
          ]),
          body: [{ kind: 'return' as const, expr: boolLit(false) }],
        },
      ],
    ],
    [
      'does not merge when bodies differ',
      [
        {
          kind: 'if' as const,
          cond: notExpr(isArray),
          body: [{ kind: 'return' as const, expr: boolLit(false) }],
        },
        {
          kind: 'if' as const,
          cond: notExpr(isInt),
          body: [{ kind: 'return' as const, expr: boolLit(true) }],
        },
      ],
      [
        {
          kind: 'if' as const,
          cond: notExpr(isArray),
          body: [{ kind: 'return' as const, expr: boolLit(false) }],
        },
        {
          kind: 'if' as const,
          cond: notExpr(isInt),
          body: [{ kind: 'return' as const, expr: boolLit(true) }],
        },
      ],
    ],
  ] as [string, Block, Block][])('%s', (_name, input, expected) => {
    expect(combine(input)).toEqual(expected);
  });
});
