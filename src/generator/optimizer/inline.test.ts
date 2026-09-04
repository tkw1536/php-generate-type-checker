import { describe, expect, it } from 'vitest';
import { parseType } from '../../parser/index.ts';
import {
  andExpr,
  arrayAccessRef,
  boolLit,
  callCheckerExpr,
  callExpr,
  failIfStmt,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  returnStmt,
  variableRef,
} from '../ir/index.ts';
import { substituteExpr } from '../ir/substitute.ts';
import type { Block, CheckerIR, Expr } from '../ir/types.ts';
import { buildMany } from '../pipeline.ts';
import { optimize } from './index.ts';
import { inlineBlock, negateBlock } from './inline.ts';
import { prunePrograms } from './prune.ts';
import { createOptimizerParams } from './params.ts';
import { substituteValueRef } from '../ir/substitute.ts';

const $v = variableRef('$value');
const $elem = variableRef('$value1');

function ir(
  programs: CheckerIR['programs'],
  order: string[],
  entries?: string[],
): CheckerIR {
  return {
    programs,
    order,
    entries: entries ?? (order[0] !== undefined ? [order[0]] : []),
  };
}

describe('substituteValueRef', () => {
  it('nests array access off substituted subject', () => {
    const result = substituteValueRef(
      { kind: 'array_access', object: $v, key: 'bar' },
      '$value',
      { kind: 'array_access', object: $v, key: 'foo' },
    );
    expect(result).toEqual({
      kind: 'array_access',
      object: { kind: 'array_access', object: $v, key: 'foo' },
      key: 'bar',
    });
  });
});

describe('inlineBlock', () => {
  const helperBody: Block = [
    {
      kind: 'if',
      cond: notExpr(callExpr('is_array', [refArg($v)])),
      body: [returnStmt(boolLit(false))],
    },
    returnStmt(boolLit(true)),
  ];

  const helperIr = ir(
    {
      isList: { parameter: '$value', body: helperBody },
      main: {
        parameter: '$value',
        body: [returnStmt(callCheckerExpr('isList', $v))],
      },
    },
    ['main', 'isList'],
  );

  it('inlines return call_checker into callee body', () => {
    const result = inlineBlock(helperIr.programs.main.body, helperIr, 'main');
    expect(result.length).toBeGreaterThan(1);
    expect(
      result.some(
        (s) => s.kind === 'if' && s.cond.kind === 'not',
      ),
    ).toBe(true);
  });

  it('inlines single-return helper into return expression', () => {
    const singleReturnIr = ir(
      {
        isInt: {
          parameter: '$value',
          body: [returnStmt(callExpr('is_int', [refArg($v)]))],
        },
        main: {
          parameter: '$value',
          body: [returnStmt(callCheckerExpr('isInt', $elem))],
        },
      },
      ['main', 'isInt'],
    );
    const result = inlineBlock(
      singleReturnIr.programs.main.body,
      singleReturnIr,
      'main',
    );
    expect(result).toEqual([
      returnStmt(callExpr('is_int', [refArg($elem)])),
    ]);
  });

  it('inlines single-return helpers through not(or(...)) in if condition', () => {
    const isXExpr = andExpr([
      callExpr('is_array', [refArg($v)]),
      callExpr('array_key_exists', [literalArg('x'), refArg($v)]),
      callExpr('is_string', [refArg(arrayAccessRef($v, 'x'))]),
    ]);
    const isYExpr = andExpr([
      callExpr('is_array', [refArg($v)]),
      callExpr('array_key_exists', [literalArg('y'), refArg($v)]),
      callExpr('is_string', [refArg(arrayAccessRef($v, 'y'))]),
    ]);
    const nestedUnionIr = ir(
      {
        isArrayXString: {
          parameter: '$value',
          body: [returnStmt(isXExpr)],
        },
        isArrayYString: {
          parameter: '$value',
          body: [returnStmt(isYExpr)],
        },
        main: {
          parameter: '$value',
          body: [
            {
              kind: 'foreach',
              iterable: $v,
              keyVar: null,
              valueVar: '$value1',
              body: [
                failIfStmt(
                  orExpr([
                    callCheckerExpr('isArrayXString', $elem),
                    callCheckerExpr('isArrayYString', $elem),
                  ]),
                ),
              ],
            },
            returnStmt(boolLit(true)),
          ],
        },
      },
      ['main', 'isArrayXString', 'isArrayYString'],
    );
    const result = inlineBlock(
      nestedUnionIr.programs.main.body,
      nestedUnionIr,
      'main',
    );
    const foreachStmt = result.find((s) => s.kind === 'foreach');
    expect(foreachStmt?.kind).toBe('foreach');
    if (foreachStmt?.kind !== 'foreach') {
      return;
    }
    const failIf = foreachStmt.body[0];
    expect(failIf?.kind).toBe('if');
    if (failIf?.kind !== 'if') {
      return;
    }
    expect(failIf.cond).toEqual(
      notExpr(
        orExpr([
          substituteExpr(isXExpr, '$value', $elem),
          substituteExpr(isYExpr, '$value', $elem),
        ]),
      ),
    );
  });

  it('inlines call_checker nested under not inside or', () => {
    const helperExpr = andExpr([
      callExpr('is_int', [refArg($v)]),
    ]);
    const peelIr = ir(
      {
        helper: {
          parameter: '$value',
          body: [returnStmt(helperExpr)],
        },
        main: {
          parameter: '$value',
          body: [
            returnStmt(
              orExpr([
                notExpr(callCheckerExpr('helper', $v)),
                callExpr('is_string', [refArg($v)]),
              ]),
            ),
          ],
        },
      },
      ['main', 'helper'],
    );
    const result = inlineBlock(peelIr.programs.main.body, peelIr, 'main');
    expect(result).toEqual([
      returnStmt(
        orExpr([notExpr(helperExpr), callExpr('is_string', [refArg($v)])]),
      ),
    ]);
  });

  it('peels or before inlining', () => {
    const orIr = ir(
      {
        helper: {
          parameter: '$value',
          body: [returnStmt(callExpr('is_string', [refArg($v)]))],
        },
        main: {
          parameter: '$value',
          body: [
            returnStmt(
              orExpr([callExpr('is_int', [refArg($v)]), callCheckerExpr('helper', $v)]),
            ),
          ],
        },
      },
      ['main', 'helper'],
    );
    const result = inlineBlock(orIr.programs.main.body, orIr, 'main');
    expect(result).toEqual([
      {
        kind: 'if',
        cond: callExpr('is_int', [refArg($v)]),
        body: [returnStmt(boolLit(true))],
      },
      returnStmt(callExpr('is_string', [refArg($v)])),
    ]);
  });
});

describe('negateBlock', () => {
  it('inverts fail-if and trailing return', () => {
    const block: Block = [
      {
        kind: 'if',
        cond: notExpr(callExpr('is_int', [refArg($v)])),
        body: [returnStmt(boolLit(false))],
      },
      returnStmt(boolLit(true)),
    ];
    expect(negateBlock(block)).toEqual([
      {
        kind: 'if',
        cond: notExpr(callExpr('is_int', [refArg($v)])),
        body: [returnStmt(notExpr(boolLit(false)))],
      },
      returnStmt(notExpr(boolLit(true))),
    ]);
  });
});

describe('prunePrograms', () => {
  it('removes unreferenced helpers but keeps entry', () => {
    const testIr = ir(
      {
        entry: {
          parameter: '$value',
          body: [returnStmt(callExpr('is_int', [refArg($v)]))],
        },
        orphan: {
          parameter: '$value',
          body: [returnStmt(boolLit(true))],
        },
      },
      ['entry', 'orphan'],
    );
    const params = createOptimizerParams(testIr);
    const pruned = prunePrograms(testIr, params);
    expect(pruned.order).toEqual(['entry']);
    expect(pruned.programs.orphan).toBeUndefined();
  });
});

function exprHasCallChecker(expr: Expr): boolean {
  switch (expr.kind) {
    case 'call_checker':
      return true;
    case 'not':
      return exprHasCallChecker(expr.expr);
    case 'and':
    case 'or':
      return expr.exprs.some(exprHasCallChecker);
    default:
      return false;
  }
}

function blockHasCallChecker(block: Block): boolean {
  for (const stmt of block) {
    switch (stmt.kind) {
      case 'return':
        if (exprHasCallChecker(stmt.expr)) {
          return true;
        }
        break;
      case 'if':
        if (exprHasCallChecker(stmt.cond) || blockHasCallChecker(stmt.body)) {
          return true;
        }
        break;
      case 'foreach':
        if (blockHasCallChecker(stmt.body)) {
          return true;
        }
        break;
      default: {
        const exhaustive: never = stmt;
        return exhaustive;
      }
    }
  }
  return false;
}

describe('optimize integration', () => {
  it('inlines nested array union in foreach and prunes helpers', () => {
    const ast = parseType('array<array{x: string}|array{y: string}>');
    const { ir: built } = buildMany([ast]);
    const optimized = optimize(built);
    const entry = optimized.programs[optimized.order[0]];
    expect(blockHasCallChecker(entry.body)).toBe(false);
    expect(optimized.order.length).toBeLessThan(built.order.length);
  });

  it('inlines shape union and prunes helpers', () => {
    const ast = parseType('array{left: array{}, right: never[]}|array{}');
    const { ir: built } = buildMany([ast]);
    const optimized = optimize(built);
    const entry = optimized.programs[optimized.order[0]];
    expect(blockHasCallChecker(entry.body)).toBe(false);
    expect(optimized.order.length).toBeLessThan(built.order.length);
  });
});
