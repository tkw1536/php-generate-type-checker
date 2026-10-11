import { describe, expect, it } from 'vitest';
import {
  andExpr,
  binExpr,
  callArg,
  callExpr,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  variableRef,
} from '../../../ir/index.ts';
import { equals } from '../../../ir/equals.ts';
import { DECIMAL_INT_STRING_PATTERN } from '../../../decimalIntString.ts';
import { canonicalizeFactExpr } from './canon.ts';
import { withTrueFact, emptyFactEnv } from './env.ts';

const $key = variableRef(0);
const s = refArg($key);

const nonDecimal = andExpr([
  callExpr('is_string', [s]),
  binExpr(
    '!==',
    callArg('preg_match', [literalArg(DECIMAL_INT_STRING_PATTERN), s]),
    literalArg('1'),
  ),
]);

const expandedNotKeyOk = andExpr([
  notExpr(callExpr('is_int', [s])),
  orExpr([
    notExpr(callExpr('is_string', [s])),
    binExpr(
      '===',
      callArg('preg_match', [literalArg(DECIMAL_INT_STRING_PATTERN), s]),
      literalArg('1'),
    ),
  ]),
]);

describe('canonicalizeFactExpr', () => {
  it('pushes not through and and expands !== to not ===', () => {
    const negatedOr = notExpr(
      orExpr([callExpr('is_int', [s]), nonDecimal]),
    );
    expect(canonicalizeFactExpr(negatedOr)).toEqual(expandedNotKeyOk);
  });

  it('stores expanded complementary false fact from true OR', () => {
    const env = withTrueFact(
      emptyFactEnv(),
      orExpr([callExpr('is_int', [s]), nonDecimal]),
    );
    expect(env.falseFacts.some((f) => equals(f, expandedNotKeyOk))).toBe(true);
  });
});
