import { describe, expect, it } from 'vitest';
import {
  andExpr,
  binExpr,
  boolLit,
  callArg,
  callExpr,
  failIfStmt,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  returnStmt,
  parameterRef,
  variableRef,
} from '../ir/index.ts';
import type { Block, Stmt } from '../ir/types.ts';
import {
  DECIMAL_INT_STRING_PATTERN,
  decimalIntStringExpr,
  nonDecimalIntStringExpr,
} from '../decimalIntString.ts';
import { simplifyExpression } from './expression.ts';
import { createOptimizerParams } from './params.ts';
import { applyKnownFacts } from './knownFacts.ts';
import { emptyFactEnv } from './knownFacts.env.ts';

const defaultParams = createOptimizerParams({
  programs: {},
  order: [],
  entries: [],
});

const $v = parameterRef();

function expectIf(stmt: Stmt | undefined): Extract<Stmt, { kind: 'if' }> {
  expect(stmt?.kind).toBe('if');
  if (stmt?.kind !== 'if') {
    throw new Error('expected if');
  }
  return stmt;
}

function expectForeach(
  stmt: Stmt | undefined,
): Extract<Stmt, { kind: 'foreach' }> {
  expect(stmt?.kind).toBe('foreach');
  if (stmt?.kind !== 'foreach') {
    throw new Error('expected foreach');
  }
  return stmt;
}

function foldsArrayKeyCheckOnForeachKey(): void {
  const $key = variableRef(0);
  const arrayKey = orExpr([
    callExpr('is_string', [refArg($key)]),
    callExpr('is_int', [refArg($key)]),
  ]);
  const block: Block = [
    {
      kind: 'foreach',
      iterable: $v,
      keyVar: 0,
      valueVar: 1,
      body: [failIfStmt(arrayKey)],
    },
  ];
  const result = applyKnownFacts(block, emptyFactEnv());
  const innerIf = expectIf(expectForeach(result[0]).body[0]);
  expect(innerIf.cond).toEqual(boolLit(false));
}

function foldsIntOrNonDecimalIntStringOnForeachKey(): void {
  const $key = variableRef(0);
  const keyOk = orExpr([
    callExpr('is_int', [refArg($key)]),
    nonDecimalIntStringExpr(refArg($key)),
  ]);
  const block: Block = [
    {
      kind: 'foreach',
      iterable: $v,
      keyVar: 0,
      valueVar: 1,
      body: [
        {
          kind: 'if',
          cond: keyOk,
          body: [returnStmt(boolLit(true))],
        },
      ],
    },
  ];
  const result = applyKnownFacts(block, emptyFactEnv());
  const innerIf = expectIf(expectForeach(result[0]).body[0]);
  expect(innerIf.cond).toEqual(boolLit(true));
}

function foldsExpandedNonDecimalKeyNegationOnForeachKey(): void {
  const $key = variableRef(0);
  const $item = variableRef(1);
  const s = refArg($key);
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
  const block: Block = [
    {
      kind: 'foreach',
      iterable: $v,
      keyVar: 0,
      valueVar: 1,
      body: [
        {
          kind: 'if',
          cond: orExpr([
            expandedNotKeyOk,
            notExpr(callExpr('is_string', [refArg($item)])),
          ]),
          body: [returnStmt(boolLit(false))],
        },
      ],
    },
  ];
  const result = applyKnownFacts(block, emptyFactEnv());
  const innerIf = expectIf(expectForeach(result[0]).body[0]);
  expect(simplifyExpression(innerIf.cond, defaultParams)).toEqual(
    notExpr(callExpr('is_string', [refArg($item)])),
  );
}

function foldsDecimalIntStringFailIfToTrueOnForeachKey(): void {
  const $key = variableRef(0);
  const block: Block = [
    {
      kind: 'foreach',
      iterable: $v,
      keyVar: 0,
      valueVar: 1,
      body: [failIfStmt(decimalIntStringExpr(refArg($key)))],
    },
  ];
  const result = applyKnownFacts(block, emptyFactEnv());
  const innerIf = expectIf(expectForeach(result[0]).body[0]);
  expect(innerIf.cond).toEqual(boolLit(true));
}

function absorbsPregIntoNotStringForNonDecimalFailIf(): void {
  const $key = variableRef(0);
  const s = refArg($key);
  // Body-local simplify of !non-decimal-int-string:
  // !is_string || preg === 1. Under key facts, preg === 1 ⇒ !is_string.
  const failNonDecimal = orExpr([
    notExpr(callExpr('is_string', [s])),
    binExpr(
      '===',
      callArg('preg_match', [literalArg(DECIMAL_INT_STRING_PATTERN), s]),
      literalArg('1'),
    ),
  ]);
  const block: Block = [
    {
      kind: 'foreach',
      iterable: $v,
      keyVar: 0,
      valueVar: 1,
      body: [
        {
          kind: 'if',
          cond: failNonDecimal,
          body: [returnStmt(boolLit(false))],
        },
      ],
    },
  ];
  const result = applyKnownFacts(block, emptyFactEnv());
  const innerIf = expectIf(expectForeach(result[0]).body[0]);
  expect(innerIf.cond).toEqual(notExpr(callExpr('is_string', [s])));
}

describe('applyKnownFacts foreach keys', () => {
  it(
    'folds array-key check on foreach key to false fail-if',
    foldsArrayKeyCheckOnForeachKey,
  );
  it(
    'folds int|non-decimal-int-string check on foreach key to true',
    foldsIntOrNonDecimalIntStringOnForeachKey,
  );
  it(
    'folds expanded !(int|non-decimal-int-string) on foreach key',
    foldsExpandedNonDecimalKeyNegationOnForeachKey,
  );
  it(
    'folds decimal-int-string fail-if to true on foreach key',
    foldsDecimalIntStringFailIfToTrueOnForeachKey,
  );
  it(
    'absorbs preg check into !is_string for non-decimal-int-string fail-if',
    absorbsPregIntoNotStringForNonDecimalFailIf,
  );
});
