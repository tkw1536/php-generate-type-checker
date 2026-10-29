import { describe, expect, it } from 'vitest';
import {
  binExpr,
  boolLit,
  callExpr,
  failIfStmt,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  parameterRef,
  variableRef,
} from '../../ir/index.ts';
import type { Block, Stmt } from '../../ir/types.ts';
import { combine } from './combine.ts';

const $v = parameterRef();
const $other = variableRef(99);
const isArray = callExpr('is_array', [refArg($v)]);
const isInt = callExpr('is_int', [refArg($v)]);
const isString = callExpr('is_string', [refArg($v)]);

const $k1 = variableRef(1);
const $v1 = variableRef(2);
const $k2 = variableRef(3);
const $v2 = variableRef(4);
const $v3 = variableRef(6);

function foreachStmt(
  iterable: typeof $v,
  keyVar: number | null,
  valueVar: number,
  body: Block,
): Stmt {
  return {
    kind: 'foreach',
    iterable,
    keyVar,
    valueVar,
    body,
  };
}

const failKeyNotX: Stmt = {
  kind: 'if',
  cond: binExpr('!==', refArg($k1), literalArg("'x'")),
  body: [{ kind: 'return', expr: boolLit(false) }],
};

const failKey2NotX: Stmt = {
  kind: 'if',
  cond: binExpr('!==', refArg($k2), literalArg("'x'")),
  body: [{ kind: 'return', expr: boolLit(false) }],
};

const failValue2NotString = failIfStmt(callExpr('is_string', [refArg($v2)]));
const failValue3NotInt = failIfStmt(callExpr('is_int', [refArg($v3)]));
const failValue1NotString = failIfStmt(callExpr('is_string', [refArg($v1)]));

const COMBINE_CASES = [
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
      foreachStmt($v, null, 0, []),
      failIfStmt(isInt),
    ],
    [
      failIfStmt(isArray),
      foreachStmt($v, null, 0, []),
      failIfStmt(isInt),
    ],
  ],
  [
    'merges three ifs with same body',
    [failIfStmt(isArray), failIfStmt(isInt), failIfStmt(isString)],
    [
      {
        kind: 'if' as const,
        cond: orExpr([notExpr(isArray), notExpr(isInt), notExpr(isString)]),
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
  [
    'merges consecutive foreach over same iterable',
    [
      foreachStmt($v, 1, 2, [failKeyNotX]),
      foreachStmt($v, 3, 4, [failValue2NotString]),
    ],
    [
      foreachStmt($v, 1, 2, [
        failKeyNotX,
        failIfStmt(callExpr('is_string', [refArg($v1)])),
      ]),
    ],
  ],
  [
    'merges three foreach over same iterable',
    [
      foreachStmt($v, 1, 2, [failKeyNotX]),
      foreachStmt($v, 3, 4, [failValue2NotString]),
      foreachStmt($v, 5, 6, [failValue3NotInt]),
    ],
    [
      foreachStmt($v, 1, 2, [
        failKeyNotX,
        failValue1NotString,
        failIfStmt(callExpr('is_int', [refArg($v1)])),
      ]),
    ],
  ],
  [
    'does not merge foreach over different iterables',
    [
      foreachStmt($v, 1, 2, [failKeyNotX]),
      foreachStmt($other, 3, 4, [failValue2NotString]),
    ],
    [
      foreachStmt($v, 1, 2, [failKeyNotX]),
      foreachStmt($other, 3, 4, [failValue2NotString]),
    ],
  ],
  [
    'stops foreach merge at intervening stmt',
    [
      foreachStmt($v, 1, 2, [failKeyNotX]),
      failIfStmt(isArray),
      foreachStmt($v, 3, 4, [failValue2NotString]),
    ],
    [
      foreachStmt($v, 1, 2, [failKeyNotX]),
      failIfStmt(isArray),
      foreachStmt($v, 3, 4, [failValue2NotString]),
    ],
  ],
  [
    'does not merge foreach when a body returns true',
    [
      foreachStmt($v, 1, 2, [
        { kind: 'return', expr: boolLit(true) },
      ]),
      foreachStmt($v, 3, 4, [failValue2NotString]),
    ],
    [
      foreachStmt($v, 1, 2, [
        { kind: 'return', expr: boolLit(true) },
      ]),
      foreachStmt($v, 3, 4, [failValue2NotString]),
    ],
  ],
  [
    'adopts keyVar from later foreach when first has none',
    [
      foreachStmt($v, null, 2, [failValue1NotString]),
      foreachStmt($v, 3, 4, [failKey2NotX]),
    ],
    [
      foreachStmt($v, 3, 2, [failValue1NotString, failKey2NotX]),
    ],
  ],
  [
    'renames later keyVar onto first keyVar',
    [
      foreachStmt($v, 1, 2, [failKeyNotX]),
      foreachStmt($v, 3, 4, [failKey2NotX]),
    ],
    [
      foreachStmt($v, 1, 2, [failKeyNotX, failKeyNotX]),
    ],
  ],
] as [string, Block, Block][];

describe('combine', () => {
  it.each(COMBINE_CASES)('%s', (_name, input, expected) => {
    expect(combine(input).block).toEqual(expected);
  });
});
