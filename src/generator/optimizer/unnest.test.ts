import { describe, expect, it } from 'vitest';
import {
  andExpr,
  boolLit,
  callExpr,
  failIfStmt,
  notExpr,
  refArg,
  returnStmt,
  variableRef,
} from '../ir/index.ts';
import type { Block } from '../ir/types.ts';
import { unnest } from './unnest.ts';

const $v = variableRef('$value');
const isArray = callExpr('is_array', [refArg($v)]);
const isInt = callExpr('is_int', [refArg($v)]);

describe('unnest', () => {
  it.each([
    [
      'merges two nested ifs',
      [
        {
          kind: 'if' as const,
          cond: notExpr(isArray),
          body: [
            {
              kind: 'if' as const,
              cond: notExpr(isInt),
              body: [{ kind: 'return' as const, expr: boolLit(false) }],
            },
          ],
        },
      ],
      [
        {
          kind: 'if' as const,
          cond: andExpr([notExpr(isArray), notExpr(isInt)]),
          body: [{ kind: 'return' as const, expr: boolLit(false) }],
        },
      ],
    ],
    [
      'merges three nested ifs',
      [
        {
          kind: 'if' as const,
          cond: notExpr(isArray),
          body: [
            {
              kind: 'if' as const,
              cond: notExpr(isInt),
              body: [
                {
                  kind: 'if' as const,
                  cond: callExpr('is_string', [refArg($v)]),
                  body: [{ kind: 'return' as const, expr: boolLit(false) }],
                },
              ],
            },
          ],
        },
      ],
      [
        {
          kind: 'if' as const,
          cond: andExpr([
            notExpr(isArray),
            notExpr(isInt),
            callExpr('is_string', [refArg($v)]),
          ]),
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
      'does not merge when outer body has multiple stmts',
      [
        {
          kind: 'if' as const,
          cond: notExpr(isArray),
          body: [
            failIfStmt(isInt),
            returnStmt(boolLit(false)),
          ],
        },
      ],
      [
        {
          kind: 'if' as const,
          cond: notExpr(isArray),
          body: [
            failIfStmt(isInt),
            returnStmt(boolLit(false)),
          ],
        },
      ],
    ],
    [
      'unnests inside foreach body',
      [
        {
          kind: 'foreach' as const,
          iterable: $v,
          keyVar: null,
          valueVar: '$elem',
          body: [
            {
              kind: 'if' as const,
              cond: notExpr(isArray),
              body: [
                {
                  kind: 'if' as const,
                  cond: notExpr(isInt),
                  body: [{ kind: 'return' as const, expr: boolLit(false) }],
                },
              ],
            },
          ],
        },
      ],
      [
        {
          kind: 'foreach' as const,
          iterable: $v,
          keyVar: null,
          valueVar: '$elem',
          body: [
            {
              kind: 'if' as const,
              cond: andExpr([notExpr(isArray), notExpr(isInt)]),
              body: [{ kind: 'return' as const, expr: boolLit(false) }],
            },
          ],
        },
      ],
    ],
  ] as [string, Block, Block][])('%s', (_name, input, expected) => {
    expect(unnest(input)).toEqual(expected);
  });
});
