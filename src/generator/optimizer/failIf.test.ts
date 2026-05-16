import { describe, expect, it } from 'vitest';
import { callExpr, failIfStmt, notExpr, refArg, variableRef } from '../ir/';
import { failIfOrChainStmt, parseFailIfGuard } from './failIf.ts';

describe('parseFailIfGuard', () => {
  const $v = variableRef('$value');

  it('recognizes if (not guard) { return false }', () => {
    const guard = callExpr('is_array', [refArg($v)]);
    const stmt = failIfStmt(guard);
    expect(parseFailIfGuard(stmt)).toEqual(guard);
  });

  it('recognizes merged if (!a || !b) { return false }', () => {
    const a = callExpr('is_array', [refArg($v)]);
    const b = callExpr('is_string', [refArg($v)]);
    const stmt = failIfOrChainStmt([a, b]);
    expect(parseFailIfGuard(stmt)).toEqual({ kind: 'and', exprs: [a, b] });
  });

  it('returns null for positive if', () => {
    expect(
      parseFailIfGuard({
        kind: 'if',
        cond: notExpr(callExpr('is_int', [refArg($v)])),
        body: [{ kind: 'return', expr: { kind: 'bool', value: true } }],
      }),
    ).toBeNull();
  });
});
