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
import { reorder } from './reorder.ts';

const $v = variableRef('$value');
const guard = callExpr('is_array', [refArg($v)]);

describe('reorderBlock', () => {
  it.each([
    [
      'moves ifs before foreach',
      [
        {
          kind: 'foreach' as const,
          iterable: $v,
          keyVar: null,
          valueVar: '$elem',
          body: [],
        },
        failIfStmt(guard),
        failIfStmt(callExpr('is_int', [refArg($v)])),
        returnStmt(boolLit(true)),
      ],
      [
        failIfStmt(guard),
        failIfStmt(callExpr('is_int', [refArg($v)])),
        {
          kind: 'foreach' as const,
          iterable: $v,
          keyVar: null,
          valueVar: '$elem',
          body: [],
        },
        returnStmt(boolLit(true)),
      ],
    ],
    [
      'preserves if order',
      [
        failIfStmt(guard),
        failIfStmt(callExpr('is_string', [refArg($v)])),
        returnStmt(boolLit(true)),
      ],
      [
        failIfStmt(guard),
        failIfStmt(callExpr('is_string', [refArg($v)])),
        returnStmt(boolLit(true)),
      ],
    ],
  ] as [string, Block, Block][])('%s', (_name, input, expected) => {
    expect(reorder(input)).toEqual(expected);
  });
});
