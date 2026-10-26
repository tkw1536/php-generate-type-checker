import { describe, expect, it } from 'vitest';
import {
  andExpr,
  arrayAccessRef,
  binExpr,
  callArg,
  callExpr,
  literalArg,
  parameterRef,
  refArg,
} from '../../../ir/index.ts';
import {
  simplifyExpression,
} from './expression.ts';
import { createOptimizerParams } from '../../params.ts';

const defaultParams = createOptimizerParams({
  programs: {},
  order: [],
  entries: [],
});

const $v = parameterRef();

describe('normalize.order count priority', () => {
  it('reorders count after is_array before key_exists', () => {
    const input = andExpr([
      callExpr('array_key_exists', [literalArg("'k'"), refArg($v)]),
      callExpr('is_int', [refArg(arrayAccessRef($v, 'k'))]),
      binExpr('===', callArg('count', [refArg($v)]), literalArg('1')),
      callExpr('is_array', [refArg($v)]),
    ]);
    const expected = andExpr([
      callExpr('is_array', [refArg($v)]),
      binExpr('===', callArg('count', [refArg($v)]), literalArg('1')),
      callExpr('array_key_exists', [literalArg("'k'"), refArg($v)]),
      callExpr('is_int', [refArg(arrayAccessRef($v, 'k'))]),
    ]);
    expect(simplifyExpression(input, defaultParams).expr).toEqual(expected);
  });
});
