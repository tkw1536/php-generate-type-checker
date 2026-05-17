import { describe, expect, it } from 'vitest';
import {
  andExpr,
  boolLit,
  callExpr,
  notExpr,
  refArg,
  returnStmt,
  variableRef,
} from '../ir/index.ts';
import type { Block } from '../ir/types.ts';
import { simplifyExpression } from './expression.ts';
import { createOptimizerParams } from './params.ts';
import { applyKnownFacts, emptyFactEnv, substituteFacts } from './knownFacts.ts';

const defaultParams = createOptimizerParams({ programs: {}, order: [] });

const $v = variableRef('$value');
const isArray = callExpr('is_array', [refArg($v)]);

describe('substituteFacts', () => {
  it('replaces expr known false', () => {
    const env = { ...emptyFactEnv(), falseFacts: [isArray] };
    expect(substituteFacts(isArray, env)).toEqual(boolLit(false));
  });
});

describe('applyKnownFacts', () => {
  it('records false guard after early return on array check', () => {
    const block: Block = [
      { kind: 'if', cond: isArray, body: [returnStmt(boolLit(true))] },
      {
        kind: 'if',
        cond: notExpr(
          andExpr([
            callExpr('is_array', [refArg($v)]),
            callExpr('array_is_list', [refArg($v)]),
          ]),
        ),
        body: [returnStmt(boolLit(false))],
      },
    ];
    const result = applyKnownFacts(block, '$value', emptyFactEnv());
    const secondIf = result[1]!;
    expect(secondIf.kind).toBe('if');
    if (secondIf.kind !== 'if') {
      return;
    }
    const simplified = simplifyExpression(secondIf.cond, defaultParams);
    expect(simplified).toEqual(boolLit(true));
  });

  it('still applies outer facts to parameter inside foreach body', () => {
    const env = { ...emptyFactEnv(), falseFacts: [isArray] };
    const block: Block = [
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: null,
        valueVar: '$value1',
        body: [
          {
            kind: 'if',
            cond: isArray,
            body: [returnStmt(boolLit(false))],
          },
        ],
      },
    ];
    const result = applyKnownFacts(block, '$value', env);
    const foreachStmt = result[0]!;
    expect(foreachStmt.kind).toBe('foreach');
    if (foreachStmt.kind !== 'foreach') {
      return;
    }
    const innerIf = foreachStmt.body[0]!;
    expect(innerIf.kind).toBe('if');
    if (innerIf.kind !== 'if') {
      return;
    }
    expect(innerIf.cond).toEqual(boolLit(false));
  });
});
