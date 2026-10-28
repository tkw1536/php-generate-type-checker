import { describe, expect, it } from 'vitest';
import {
  andExpr,
  binExpr,
  boolLit,
  callArg,
  callExpr,
  failIfStmt,
  instanceofExpr,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  returnStmt,
  parameterRef,
} from '../../../ir/index.ts';
import type { Block, Expr, Stmt } from '../../../ir/types.ts';
import {
  applyKnownFacts,
  blockAlwaysExitsWhenEntered,
} from './apply.ts';
import type { FactEntry, FactOriginId } from './env.types.ts';
import { emptyFactEnv } from './env.types.ts';
import { canonicalizeFactExpr } from './canon.ts';
import { substituteFacts } from './substitute.ts';

const $v = parameterRef();
const isArray = callExpr('is_array', [refArg($v)]);

function assumedFact(expr: Expr, origin: FactOriginId): FactEntry {
  const canon = canonicalizeFactExpr(expr);
  return {
    expr: canon,
    origin,
    how: { kind: 'assumed', origin },
  };
}

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
  const env = {
    ...emptyFactEnv(),
    falseFacts: [assumedFact(isArray, 'ifFalse')],
  };
  expect(substituteFacts(isArray, env).expr).toEqual(boolLit(false));
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
  const result = applyKnownFacts(block, emptyFactEnv()).block;
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
  const result = applyKnownFacts(block, emptyFactEnv()).block;
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
  const result = applyKnownFacts(block, emptyFactEnv()).block;
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
  const result = applyKnownFacts(block, emptyFactEnv()).block;
  const ret = expectReturn(expectIf(result[0]).body[0]);
  expect(ret.expr).toEqual(boolLit(false));
}

function instanceofImpliesIsObjectInAnd(): void {
  const isInstance = instanceofExpr(refArg($v), 'Foo');
  const isObject = callExpr('is_object', [refArg($v)]);
  expect(
    substituteFacts(andExpr([isInstance, isObject]), emptyFactEnv()).expr,
  ).toEqual(andExpr([isInstance, boolLit(true)]));
}

function isAImpliesClassExistsInAnd(): void {
  const isA = callExpr('is_a', [
    refArg($v),
    literalArg('MyClass::class'),
    literalArg('true'),
  ]);
  const classExists = callExpr('class_exists', [refArg($v)]);
  expect(substituteFacts(andExpr([isA, classExists]), emptyFactEnv()).expr).toEqual(
    andExpr([isA, boolLit(true)]),
  );
}

const countZero = binExpr(
  '===',
  callArg('count', [refArg($v)]),
  literalArg('0'),
);
const eqEmpty = binExpr('===', refArg($v), literalArg('[]'));

function countZeroBecomesEmptyUnderIsArrayFact(): void {
  const env = {
    ...emptyFactEnv(),
    trueFacts: [assumedFact(isArray, 'ifTrue')],
  };
  expect(substituteFacts(countZero, env).expr).toEqual(eqEmpty);
}

function countZeroUnchangedWithoutIsArray(): void {
  expect(substituteFacts(countZero, emptyFactEnv()).expr).toEqual(countZero);
}

function isArrayAndCountZeroAbsorbsToEmpty(): void {
  expect(
    substituteFacts(andExpr([isArray, countZero]), emptyFactEnv()).expr,
  ).toEqual(eqEmpty);
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
  it(
    'rewrites count===0 to ===[] under is_array fact',
    countZeroBecomesEmptyUnderIsArrayFact,
  );
  it(
    'leaves count===0 unchanged without is_array',
    countZeroUnchangedWithoutIsArray,
  );
  it(
    'absorbs is_array && count===0 to ===[]',
    isArrayAndCountZeroAbsorbsToEmpty,
  );
});

describe('blockAlwaysExitsWhenEntered', () => {
  it.each(EXIT_CASES)('%s', (_name, block, expected) => {
    expect(blockAlwaysExitsWhenEntered(block)).toBe(expected);
  });
});
