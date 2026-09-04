import { describe, expect, it } from 'vitest';
import {
  andExpr,
  boolLit,
  callExpr,
  failIfStmt,
  instanceofExpr,
  notExpr,
  orExpr,
  refArg,
  returnStmt,
  variableRef,
} from '../ir/index.ts';
import type { Block, Stmt } from '../ir/types.ts';
import { simplifyExpression } from './expression.ts';
import { createOptimizerParams } from './params.ts';
import { applyKnownFacts, emptyFactEnv } from './knownFacts.ts';
import { equals } from '../ir/equals.ts';

const defaultParams = createOptimizerParams({
  programs: {},
  order: [],
  entries: [],
});

const $v = variableRef('$value');
const isArray = callExpr('is_array', [refArg($v)]);

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

function recordsFalseGuardAfterEarlyReturn(): void {
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
  const simplified = simplifyExpression(
    expectIf(result[1]).cond,
    defaultParams,
  );
  expect(simplified).toEqual(boolLit(true));
}

function simplifiesListGuardFollowUp(): void {
  const isList = callExpr('array_is_list', [refArg($v)]);
  const block: Block = [
    {
      kind: 'if',
      cond: andExpr([isArray, isList]),
      body: [returnStmt(boolLit(true))],
    },
    {
      kind: 'if',
      cond: notExpr(andExpr([isArray, isList])),
      body: [returnStmt(boolLit(false))],
    },
    returnStmt(boolLit(true)),
  ];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  const simplified = simplifyExpression(
    expectIf(result[1]).cond,
    defaultParams,
  );
  expect(simplified).toEqual(boolLit(true));
}

function stillAppliesOuterFactsInsideForeach(): void {
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
  const innerIf = expectIf(expectForeach(result[0]).body[0]);
  expect(innerIf.cond).toEqual(boolLit(false));
}

function flipsFalseNotFactAfterExitingIf(): void {
  const block: Block = [
    { kind: 'if', cond: notExpr(isArray), body: [returnStmt(boolLit(true))] },
    { kind: 'if', cond: isArray, body: [returnStmt(boolLit(false))] },
  ];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  expect(expectIf(result[1]).cond).toEqual(boolLit(true));
}

function recordsEachDisjunctAsFalse(): void {
  const isInt = callExpr('is_int', [refArg($v)]);
  const block: Block = [
    {
      kind: 'if',
      cond: orExpr([isArray, isInt]),
      body: [returnStmt(boolLit(true))],
    },
    { kind: 'if', cond: isArray, body: [returnStmt(boolLit(false))] },
  ];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  expect(expectIf(result[1]).cond).toEqual(boolLit(false));
}

function recordsEachConjunctAsTrue(): void {
  const isList = callExpr('array_is_list', [refArg($v)]);
  const block: Block = [
    {
      kind: 'if',
      cond: andExpr([isArray, isList]),
      body: [
        { kind: 'if', cond: isArray, body: [returnStmt(boolLit(true))] },
      ],
    },
  ];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  const innerIf = expectIf(expectIf(result[0]).body[0]);
  expect(innerIf.cond).toEqual(boolLit(true));
}

function doesNotRecordFalseWhenBodyFallsThrough(): void {
  const block: Block = [
    { kind: 'if', cond: isArray, body: [] },
    failIfStmt(isArray),
  ];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  expect(equals(expectIf(result[1]).cond, notExpr(isArray))).toBe(true);
}

function dropsIsObjectAfterInstanceofFailIf(): void {
  const isInstance = instanceofExpr(refArg($v), 'Foo');
  const isObject = callExpr('is_object', [refArg($v)]);
  const block: Block = [failIfStmt(isInstance), failIfStmt(isObject)];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  expect(expectIf(result[1]).cond).toEqual(boolLit(false));
}

function dropsIsObjectInsideInstanceofBody(): void {
  const isInstance = instanceofExpr(refArg($v), 'Foo');
  const isObject = callExpr('is_object', [refArg($v)]);
  const block: Block = [
    {
      kind: 'if',
      cond: isInstance,
      body: [{ kind: 'if', cond: isObject, body: [returnStmt(boolLit(true))] }],
    },
  ];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  const innerIf = expectIf(expectIf(result[0]).body[0]);
  expect(innerIf.cond).toEqual(boolLit(true));
}

describe('applyKnownFacts', () => {
  it(
    'records false guard after early return on array check',
    recordsFalseGuardAfterEarlyReturn,
  );
  it(
    'simplifies list guard follow-up when first branch returns true on and',
    simplifiesListGuardFollowUp,
  );
  it(
    'still applies outer facts to parameter inside foreach body',
    stillAppliesOuterFactsInsideForeach,
  );
  it(
    'flips false not fact into true on inner expr after exiting if',
    flipsFalseNotFactAfterExitingIf,
  );
  it(
    'records each disjunct as false after if on or with exiting body',
    recordsEachDisjunctAsFalse,
  );
  it(
    'records each conjunct as true inside if with and condition',
    recordsEachConjunctAsTrue,
  );
  it(
    'does not record false fact when if body can fall through',
    doesNotRecordFalseWhenBodyFallsThrough,
  );
  it(
    'drops is_object after instanceof fail-if records true fact',
    dropsIsObjectAfterInstanceofFailIf,
  );
  it(
    'drops is_object inside instanceof if body',
    dropsIsObjectInsideInstanceofBody,
  );
});
