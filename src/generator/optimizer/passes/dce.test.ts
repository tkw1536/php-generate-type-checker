import { describe, expect, it } from 'vitest';
import {
  binExpr,
  boolLit,
  callExpr,
  failIfStmt,
  literalArg,
  refArg,
  returnStmt,
  parameterRef,
  variableRef,
} from '../../ir/index.ts';
import type { Block } from '../../ir/types.ts';
import { dce } from './dce.ts';

const $v = parameterRef();
const isArray = callExpr('is_array', [refArg($v)]);
const $item = variableRef(1);
const $key = variableRef(0);

const DCE_CASES = [
  [
    'drops if false and keeps tail',
    [
      { kind: 'if', cond: boolLit(false), body: [returnStmt(boolLit(false))] },
      returnStmt(boolLit(true)),
    ],
    [returnStmt(boolLit(true))],
  ],
  [
    'splices if true and drops unreachable tail',
    [
      { kind: 'if', cond: boolLit(true), body: [returnStmt(boolLit(false))] },
      returnStmt(boolLit(true)),
    ],
    [returnStmt(boolLit(false))],
  ],
  [
    'splices if true body with following statements',
    [
      { kind: 'if', cond: boolLit(true), body: [failIfStmt(isArray)] },
      returnStmt(boolLit(true)),
    ],
    [failIfStmt(isArray), returnStmt(boolLit(true))],
  ],
  [
    'drops statements after return',
    [returnStmt(boolLit(false)), returnStmt(boolLit(true))],
    [returnStmt(boolLit(false))],
  ],
  [
    'removes empty foreach',
    [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: null,
        valueVar: 0,
        body: [],
      },
      returnStmt(boolLit(true)),
    ],
    [returnStmt(boolLit(true))],
  ],
  [
    'recurses into foreach body then constant-return rewrite',
    [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: null,
        valueVar: 0,
        body: [returnStmt(boolLit(false)), returnStmt(boolLit(true))],
      },
    ],
    [
      {
        kind: 'if',
        cond: binExpr('!==', refArg($v), literalArg('[]')),
        body: [returnStmt(boolLit(false))],
      },
    ],
  ],
  [
    'drops unused foreach keyVar',
    [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: 0,
        valueVar: 1,
        body: [failIfStmt(callExpr('is_string', [refArg($item)]))],
      },
    ],
    [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: null,
        valueVar: 1,
        body: [failIfStmt(callExpr('is_string', [refArg($item)]))],
      },
    ],
  ],
  [
    'rewrites foreach with constant return to non-empty check',
    [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: 0,
        valueVar: 1,
        body: [returnStmt(boolLit(false))],
      },
    ],
    [
      {
        kind: 'if',
        cond: binExpr('!==', refArg($v), literalArg('[]')),
        body: [returnStmt(boolLit(false))],
      },
    ],
  ],
  [
    'keeps foreach when return uses value var',
    [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: null,
        valueVar: 1,
        body: [returnStmt(callExpr('is_string', [refArg($item)]))],
      },
    ],
    [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: null,
        valueVar: 1,
        body: [returnStmt(callExpr('is_string', [refArg($item)]))],
      },
    ],
  ],
  [
    'keeps foreach when return uses key var',
    [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: 0,
        valueVar: 1,
        body: [returnStmt(callExpr('is_int', [refArg($key)]))],
      },
    ],
    [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: 0,
        valueVar: 1,
        body: [returnStmt(callExpr('is_int', [refArg($key)]))],
      },
    ],
  ],
] as [string, Block, Block][];

describe('dce', () => {
  it.each(DCE_CASES)('%s', (_name, input, expected) => {
    expect(dce(input)).toEqual(expected);
  });
});
