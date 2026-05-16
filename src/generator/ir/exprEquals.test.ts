import { describe, expect, it } from 'vitest';
import { callExpr, failIfStmt, notExpr, refArg } from './expr.ts';
import { variableRef } from './refs.ts';
import { exprEquals, isFailIfReturnFalse } from './exprEquals.ts';

describe('exprEquals', () => {
  const $v = variableRef('$value');
  const isInt = callExpr('is_int', [refArg($v)]);

  it('compares structurally', () => {
    expect(exprEquals(isInt, callExpr('is_int', [refArg($v)]))).toBe(true);
    expect(exprEquals(isInt, callExpr('is_string', [refArg($v)]))).toBe(false);
  });
});

describe('isFailIfReturnFalse', () => {
  const $v = variableRef('$value');

  it('recognizes if (not guard) { return false }', () => {
    const guard = callExpr('is_array', [refArg($v)]);
    const stmt = failIfStmt(guard);
    expect(isFailIfReturnFalse(stmt)).toEqual(guard);
  });

  it('returns null for if without return false body', () => {
    expect(
      isFailIfReturnFalse({
        kind: 'if',
        cond: notExpr(callExpr('is_int', [refArg($v)])),
        body: [{ kind: 'return', expr: { kind: 'bool', value: true } }],
      }),
    ).toBeNull();
  });
});
