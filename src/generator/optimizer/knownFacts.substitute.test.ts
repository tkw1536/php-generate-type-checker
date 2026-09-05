import { describe, expect, it } from 'vitest';
import {
  andExpr,
  boolLit,
  callExpr,
  failIfStmt,
  instanceofExpr,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  returnStmt,
  variableRef,
} from '../ir/index.ts';
import type { Block, Stmt } from '../ir/types.ts';
import {
  applyKnownFacts,
  blockAlwaysExitsWhenEntered,
  substituteFacts,
} from './knownFacts.ts';
import { emptyFactEnv } from "./knownFacts.env.ts";

const $v = variableRef('$value');
const isArray = callExpr('is_array', [refArg($v)]);

function expectIf(stmt: Stmt | undefined): Extract<Stmt, { kind: 'if' }> {
  expect(stmt?.kind).toBe('if');
  if (stmt?.kind !== 'if') {
    throw new Error('expected if');
  }
  return stmt;
}

function expectReturn(stmt: Stmt | undefined): Extract<Stmt, { kind: 'return' }> {
  expect(stmt?.kind).toBe('return');
  if (stmt?.kind !== 'return') {
    throw new Error('expected return');
  }
  return stmt;
}

function replacesExprKnownFalse(): void {
  const env = { ...emptyFactEnv(), falseFacts: [isArray] };
  expect(substituteFacts(isArray, env)).toEqual(boolLit(false));
}

function replacesConjunctsKnownTrue(): void {
  const isList = callExpr('array_is_list', [refArg($v)]);
  const block: Block = [
    {
      kind: 'if',
      cond: andExpr([isArray, isList]),
      body: [returnStmt(andExpr([isArray, isList]))],
    },
  ];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  const ret = expectReturn(expectIf(result[0]).body[0]);
  expect(ret.expr).toEqual(boolLit(true));
}

function replacesDisjunctsKnownFalse(): void {
  const isInt = callExpr('is_int', [refArg($v)]);
  const block: Block = [
    {
      kind: 'if',
      cond: orExpr([isArray, isInt]),
      body: [returnStmt(boolLit(true))],
    },
    {
      kind: 'if',
      cond: orExpr([isArray, isInt]),
      body: [returnStmt(boolLit(false))],
    },
  ];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  expect(expectIf(result[1]).cond).toEqual(boolLit(false));
}

function flipsTrueNotFact(): void {
  const block: Block = [
    {
      kind: 'if',
      cond: notExpr(isArray),
      body: [
        { kind: 'if', cond: isArray, body: [returnStmt(boolLit(false))] },
      ],
    },
  ];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  const innerIf = expectIf(expectIf(result[0]).body[0]);
  expect(innerIf.cond).toEqual(boolLit(false));
}

function appliesDeMorganViaNotThenOr(): void {
  const isInt = callExpr('is_int', [refArg($v)]);
  const block: Block = [
    {
      kind: 'if',
      cond: notExpr(orExpr([isArray, isInt])),
      body: [returnStmt(orExpr([isArray, isInt]))],
    },
  ];
  const result = applyKnownFacts(block, '$value', emptyFactEnv());
  const ret = expectReturn(expectIf(result[0]).body[0]);
  expect(ret.expr).toEqual(boolLit(false));
}

function instanceofImpliesIsObjectInAnd(): void {
  const isInstance = instanceofExpr(refArg($v), 'Foo');
  const isObject = callExpr('is_object', [refArg($v)]);
  expect(
    substituteFacts(andExpr([isInstance, isObject]), emptyFactEnv()),
  ).toEqual(andExpr([isInstance, boolLit(true)]));
}

function isAImpliesClassExistsInAnd(): void {
  const isA = callExpr('is_a', [
    refArg($v),
    literalArg('MyClass::class'),
    literalArg('true'),
  ]);
  const classExists = callExpr('class_exists', [refArg($v)]);
  expect(substituteFacts(andExpr([isA, classExists]), emptyFactEnv())).toEqual(
    andExpr([isA, boolLit(true)]),
  );
}

const EXIT_CASES = [
  ['return only', [returnStmt(boolLit(true))], true],
  [
    'fail-if then return',
    [
      {
        kind: 'if',
        cond: notExpr(isArray),
        body: [returnStmt(boolLit(false))],
      },
      returnStmt(boolLit(true)),
    ],
    true,
  ],
  ['early return on condition', [returnStmt(boolLit(true))], true],
  [
    'if alone is not an exiting body',
    [{ kind: 'if', cond: isArray, body: [returnStmt(boolLit(true))] }],
    false,
  ],
  ['empty block', [], false],
  ['non-return tail', [returnStmt(boolLit(true)), failIfStmt(isArray)], false],
  [
    'trailing return after if that may fall through inside',
    [
      {
        kind: 'if',
        cond: isArray,
        body: [
          {
            kind: 'if',
            cond: callExpr('is_int', [refArg($v)]),
            body: [],
          },
        ],
      },
      returnStmt(boolLit(true)),
    ],
    true,
  ],
  [
    'empty if body has no trailing return',
    [{ kind: 'if', cond: isArray, body: [] }],
    false,
  ],
] as [string, Block, boolean][];

describe('substituteFacts', () => {
  it('replaces expr known false', replacesExprKnownFalse);
  it(
    'replaces conjuncts known true from decomposed and fact',
    replacesConjunctsKnownTrue,
  );
  it(
    'replaces disjuncts known false from decomposed or fact',
    replacesDisjunctsKnownFalse,
  );
  it('flips true not fact into false on inner expr', flipsTrueNotFact);
  it(
    'applies De Morgan via not then or on true fact',
    appliesDeMorganViaNotThenOr,
  );
  it(
    'replaces is_object with true after instanceof in and',
    instanceofImpliesIsObjectInAnd,
  );
  it(
    'replaces class_exists with true after is_a in and',
    isAImpliesClassExistsInAnd,
  );
});

describe('blockAlwaysExitsWhenEntered', () => {
  it.each(EXIT_CASES)('%s', (_name, block, expected) => {
    expect(blockAlwaysExitsWhenEntered(block)).toBe(expected);
  });
});
