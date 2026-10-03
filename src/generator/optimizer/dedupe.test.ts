import { describe, expect, it } from 'vitest';
import {
  callExpr,
  failIfStmt,
  refArg,
  parameterRef,
  variableRef,
} from '../ir/index.ts';
import type { Block } from '../ir/types.ts';
import { dedupe } from './dedupe.ts';

const $v = parameterRef();
const isArray = callExpr('is_array', [refArg($v)]);
const isInt = callExpr('is_int', [refArg($v)]);

const FOREACH_LOOP = {
  kind: 'foreach' as const,
  iterable: $v,
  keyVar: null,
  valueVar: 0,
  body: [failIfStmt(callExpr('is_string', [refArg(variableRef(0))]))],
};

const DEDUPE_IF_CASES = [
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
] as [string, Block, Block][];

const DEDUPE_FOREACH_CASES = [
  ['removes duplicate foreach', [FOREACH_LOOP, FOREACH_LOOP], [FOREACH_LOOP]],
  [
    'removes non-consecutive duplicate foreach',
    [FOREACH_LOOP, failIfStmt(isInt), FOREACH_LOOP],
    [FOREACH_LOOP, failIfStmt(isInt)],
  ],
  [
    'keeps foreach when bodies differ',
    [
      FOREACH_LOOP,
      {
        ...FOREACH_LOOP,
        body: [failIfStmt(callExpr('is_int', [refArg(variableRef(0))]))],
      },
    ],
    [
      FOREACH_LOOP,
      {
        ...FOREACH_LOOP,
        body: [failIfStmt(callExpr('is_int', [refArg(variableRef(0))]))],
      },
    ],
  ],
  [
    'keeps foreach when iterable differs',
    [FOREACH_LOOP, { ...FOREACH_LOOP, iterable: variableRef(2) }],
    [FOREACH_LOOP, { ...FOREACH_LOOP, iterable: variableRef(2) }],
  ],
] as [string, Block, Block][];

describe('dedupeBlock', () => {
  it.each(DEDUPE_IF_CASES)('%s', (_name, input, expected) => {
    expect(dedupe(input)).toEqual(expected);
  });

  it.each(DEDUPE_FOREACH_CASES)('%s', (_name, input, expected) => {
    expect(dedupe(input)).toEqual(expected);
  });
});
