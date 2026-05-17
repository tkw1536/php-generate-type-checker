import { describe, expect, it } from 'vitest';
import { callExpr, failIfStmt, refArg, variableRef } from '../ir/index.ts';
import type { Block } from '../ir/types.ts';
import { dedupe } from './dedupe.ts';

const $v = variableRef('$value');
const isArray = callExpr('is_array', [refArg($v)]);
const isInt = callExpr('is_int', [refArg($v)]);

describe('dedupeBlock', () => {
  it.each([
    [
      'removes duplicate guard ifs',
      [failIfStmt(isArray), failIfStmt(isArray), failIfStmt(isInt)],
      [failIfStmt(isArray), failIfStmt(isInt)],
    ],
    [
      'keeps non-duplicate ifs',
      [failIfStmt(isArray), failIfStmt(isInt)],
      [failIfStmt(isArray), failIfStmt(isInt)],
    ],
    [
      'removes non-consecutive duplicate',
      [failIfStmt(isArray), failIfStmt(isInt), failIfStmt(isArray)],
      [failIfStmt(isArray), failIfStmt(isInt)],
    ],
  ] as [string, Block, Block][])('%s', (_name, input, expected) => {
    expect(dedupe(input)).toEqual(expected);
  });
});
