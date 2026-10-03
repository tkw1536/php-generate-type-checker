import { describe, expect, it } from 'vitest';
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
  parameterRef,
  variableRef,
} from '../ir/index.ts';
import { substituteExpr, substituteValueRef } from '../ir/substitute.ts';
import type { Block } from '../ir/types.ts';
import { createOptimizerParams } from './params.ts';
import { inlineBlock } from './inline.ts';
import {
  expectForeach,
  expectIf,
  ir,
  isNotGuardIf,
} from '../../../test-utils/inlineTestHelpers.ts';
import { negateBlock } from './negate.ts';
import { prunePrograms } from './prune.ts';

const $v = parameterRef();
const $elem = variableRef(0);

const HELPER_BODY: Block = [
  {
    kind: 'if',
    cond: notExpr(callExpr('is_array', [refArg($v)])),
    body: [returnStmt(boolLit(false))],
  },
  returnStmt(boolLit(true)),
];

const HELPER_IR = ir(
  {
    isList: { body: HELPER_BODY },
    main: {
      body: [returnStmt(callCheckerExpr('isList', $v))],
    },
  },
  ['main', 'isList'],
);

function nestsArrayAccessOffSubstitutedSubject(): void {
  const result = substituteValueRef(
    { kind: 'array_access', object: $v, key: 'bar' },
    { kind: 'array_access', object: $v, key: 'foo' },
  );
  expect(result).toEqual({
    kind: 'array_access',
    object: { kind: 'array_access', object: $v, key: 'foo' },
    key: 'bar',
  });
}

function inlinesReturnCallChecker(): void {
  const result = inlineBlock(HELPER_IR.programs.main.body, HELPER_IR, 'main');
  expect(result.length).toBeGreaterThan(1);
  expect(result.some((s) => isNotGuardIf(s))).toBe(true);
}

function inlinesSingleReturnHelper(): void {
  const singleReturnIr = ir(
    {
      isInt: {
        body: [returnStmt(callExpr('is_int', [refArg($v)]))],
      },
      main: {
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
  expect(result).toEqual([returnStmt(callExpr('is_int', [refArg($elem)]))]);
}

function buildNestedUnionIr(
  isXExpr: ReturnType<typeof andExpr>,
  isYExpr: ReturnType<typeof andExpr>,
) {
  return ir(
    {
      isArrayXString: {
        body: [returnStmt(isXExpr)],
      },
      isArrayYString: {
        body: [returnStmt(isYExpr)],
      },
      main: {
        body: [
          {
            kind: 'foreach',
            iterable: $v,
            keyVar: null,
            valueVar: 0,
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
}

function inlinesThroughNotOrInIfCondition(): void {
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
  const nestedUnionIr = buildNestedUnionIr(isXExpr, isYExpr);
  const result = inlineBlock(
    nestedUnionIr.programs.main.body,
    nestedUnionIr,
    'main',
  );
  const foreachStmt = expectForeach(result.find((s) => s.kind === 'foreach'));
  const failIf = expectIf(foreachStmt.body[0]);
  expect(failIf.cond).toEqual(
    notExpr(
      orExpr([
        substituteExpr(isXExpr, $elem),
        substituteExpr(isYExpr, $elem),
      ]),
    ),
  );
}

function inlinesCallCheckerNestedUnderNotInsideOr(): void {
  const helperExpr = andExpr([callExpr('is_int', [refArg($v)])]);
  const peelIr = ir(
    {
      helper: {
        body: [returnStmt(helperExpr)],
      },
      main: {
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
}

function peelsOrBeforeInlining(): void {
  const orIr = ir(
    {
      helper: {
        body: [returnStmt(callExpr('is_string', [refArg($v)]))],
      },
      main: {
        body: [
          returnStmt(
            orExpr([
              callExpr('is_int', [refArg($v)]),
              callCheckerExpr('helper', $v),
            ]),
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
}

function invertsFailIfAndTrailingReturn(): void {
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
}

function removesUnreferencedHelpers(): void {
  const testIr = ir(
    {
      entry: {
        body: [returnStmt(callExpr('is_int', [refArg($v)]))],
      },
      orphan: {
        body: [returnStmt(boolLit(true))],
      },
    },
    ['entry', 'orphan'],
  );
  const params = createOptimizerParams(testIr);
  const pruned = prunePrograms(testIr, params);
  expect(pruned.order).toEqual(['entry']);
  expect(pruned.programs.orphan).toBeUndefined();
}

describe('substituteValueRef', () => {
  it(
    'nests array access off substituted subject',
    nestsArrayAccessOffSubstitutedSubject,
  );
});

describe('inlineBlock', () => {
  it('inlines return call_checker into callee body', inlinesReturnCallChecker);
  it(
    'inlines single-return helper into return expression',
    inlinesSingleReturnHelper,
  );
  it(
    'inlines single-return helpers through not(or(...)) in if condition',
    inlinesThroughNotOrInIfCondition,
  );
  it(
    'inlines call_checker nested under not inside or',
    inlinesCallCheckerNestedUnderNotInsideOr,
  );
  it('peels or before inlining', peelsOrBeforeInlining);
});

describe('negateBlock', () => {
  it('inverts fail-if and trailing return', invertsFailIfAndTrailingReturn);
});

describe('prunePrograms', () => {
  it(
    'removes unreferenced helpers but keeps entry',
    removesUnreferencedHelpers,
  );
});
