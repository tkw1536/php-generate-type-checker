import { describe, expect, it } from 'vitest';
import {
  andExpr,
  boolLit,
  callExpr,
  failIfStmt,
  notExpr,
  orExpr,
  refArg,
  returnStmt,
  variableRef,
} from '../ir/index.ts';
import type { Block } from '../ir/types.ts';
import { flatten } from './flatten.ts';

const $v = variableRef('$value');
const isInt = callExpr('is_int', [refArg($v)]);

const FLATTEN_CASES = [
  [
    'if-return-return at block end',
    [
      {
        kind: 'if' as const,
        cond: isInt,
        body: [{ kind: 'return' as const, expr: boolLit(true) }],
      },
      returnStmt(boolLit(false)),
    ],
    [
      returnStmt(
        orExpr([
          andExpr([isInt, boolLit(true)]),
          andExpr([notExpr(isInt), boolLit(false)]),
        ]),
      ),
    ],
  ],
  [
    'unchanged when fewer than two stmts',
    [returnStmt(boolLit(true))],
    [returnStmt(boolLit(true))],
  ],
  [
    'unchanged when last is not return',
    [
      {
        kind: 'if' as const,
        cond: isInt,
        body: [{ kind: 'return' as const, expr: boolLit(true) }],
      },
      failIfStmt(callExpr('is_string', [refArg($v)])),
    ],
    [
      {
        kind: 'if' as const,
        cond: isInt,
        body: [{ kind: 'return' as const, expr: boolLit(true) }],
      },
      failIfStmt(callExpr('is_string', [refArg($v)])),
    ],
  ],
  [
    'unchanged with prefix stmts',
    [
      failIfStmt(callExpr('is_array', [refArg($v)])),
      {
        kind: 'if' as const,
        cond: isInt,
        body: [{ kind: 'return' as const, expr: boolLit(true) }],
      },
      returnStmt(boolLit(false)),
    ],
    [
      failIfStmt(callExpr('is_array', [refArg($v)])),
      returnStmt(
        orExpr([
          andExpr([isInt, boolLit(true)]),
          andExpr([notExpr(isInt), boolLit(false)]),
        ]),
      ),
    ],
  ],
] as [string, Block, Block][];

describe('flatten', () => {
  it.each(FLATTEN_CASES)('%s', (_name, input, expected) => {
    expect(flatten(input)).toEqual(expected);
  });
});
