import { describe, expect, it } from 'vitest';
import {
  boolLit,
  callExpr,
  failIfStmt,
  refArg,
  returnStmt,
  variableRef,
} from '../ir/index.ts';
import type { Block } from '../ir/types.ts';
import { dce } from './dce.ts';

const $v = variableRef('$value');
const isArray = callExpr('is_array', [refArg($v)]);

describe('dce', () => {
  it.each([
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
          valueVar: '$value1',
          body: [],
        },
        returnStmt(boolLit(true)),
      ],
      [returnStmt(boolLit(true))],
    ],
    [
      'recurses into foreach body',
      [
        {
          kind: 'foreach',
          iterable: $v,
          keyVar: null,
          valueVar: '$value1',
          body: [
            returnStmt(boolLit(false)),
            returnStmt(boolLit(true)),
          ],
        },
      ],
      [
        {
          kind: 'foreach',
          iterable: $v,
          keyVar: null,
          valueVar: '$value1',
          body: [returnStmt(boolLit(false))],
        },
      ],
    ],
  ] as [string, Block, Block][])('%s', (_name, input, expected) => {
    expect(dce(input)).toEqual(expected);
  });
});
