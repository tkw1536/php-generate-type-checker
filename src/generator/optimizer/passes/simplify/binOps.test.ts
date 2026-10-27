import { describe, expect, it } from 'vitest';
import {
  andExpr,
  binExpr,
  callExpr,
  literalArg,
  notExpr,
  parameterRef,
  refArg,
} from '../../../ir/index.ts';
import type { Expr } from '../../../ir/types.ts';
import { absorbBinOp, absorbBinOps, expandBinOp, expandBinOps } from './binOps.ts';

const $v = parameterRef();
const isInt = callExpr('is_int', [refArg($v)]);
const empty = literalArg('[]');
const ne = binExpr('!==', refArg($v), empty);

function expectBin(expr: Expr): Extract<Expr, { kind: 'bin' }> {
  expect(expr.kind).toBe('bin');
  if (expr.kind !== 'bin') {
    throw new Error('expected bin expression');
  }
  return expr;
}

describe('expandBinOp / absorbBinOp', () => {
  it('expandBinOp wraps !==', () => {
    expect(expandBinOp(expectBin(ne))).toEqual(
      notExpr(binExpr('===', refArg($v), empty)),
    );
  });

  it('absorbBinOp unwraps not(===)', () => {
    expect(absorbBinOp(notExpr(binExpr('===', refArg($v), empty)))).toEqual(
      ne,
    );
  });

  it('expandBinOps leaves positive bin', () => {
    const pos = binExpr('===', refArg($v), empty);
    expect(expandBinOps(pos)).toEqual(pos);
  });

  it('absorbBinOps through and', () => {
    const input = andExpr([notExpr(binExpr('===', refArg($v), empty)), isInt]);
    expect(absorbBinOps(input)).toEqual(andExpr([ne, isInt]));
  });
});
