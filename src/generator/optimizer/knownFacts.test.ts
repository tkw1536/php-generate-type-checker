import { describe, expect, it } from 'vitest';
import {
  andExpr,
  boolLit,
  callExpr,
  failIfStmt,
  notExpr,
  orExpr,
  refArg,
  returnStmt,
  variableRef,
} from '../ir/index.ts';
import type { Block } from '../ir/types.ts';
import { simplifyExpression } from './expression.ts';
import { createOptimizerParams } from './params.ts';
import {
  applyKnownFacts,
  blockAlwaysExitsWhenEntered,
  emptyFactEnv,
  substituteFacts,
} from './knownFacts.ts';
import { equals } from '../ir/equals.ts';

const defaultParams = createOptimizerParams({ programs: {}, order: [], entries: [] });

const $v = variableRef('$value');
const isArray = callExpr('is_array', [refArg($v)]);

describe('substituteFacts', () => {
  it('replaces expr known false', () => {
    const env = { ...emptyFactEnv(), falseFacts: [isArray] };
    expect(substituteFacts(isArray, env)).toEqual(boolLit(false));
  });

  it('replaces conjuncts known true from decomposed and fact', () => {
    const isList = callExpr('array_is_list', [refArg($v)]);
    const block: Block = [
      {
        kind: 'if',
        cond: andExpr([isArray, isList]),
        body: [returnStmt(andExpr([isArray, isList]))],
      },
    ];
    const result = applyKnownFacts(block, '$value', emptyFactEnv());
    const outerIf = result[0]!;
    expect(outerIf.kind).toBe('if');
    if (outerIf.kind !== 'if') {
      return;
    }
    const ret = outerIf.body[0]!;
    expect(ret.kind).toBe('return');
    if (ret.kind !== 'return') {
      return;
    }
    expect(ret.expr).toEqual(boolLit(true));
  });

  it('replaces disjuncts known false from decomposed or fact', () => {
    const isInt = callExpr('is_int', [refArg($v)]);
    const block: Block = [
      {
        kind: 'if',
        cond: orExpr([isArray, isInt]),
        body: [returnStmt(boolLit(true))],
      },
      { kind: 'if', cond: orExpr([isArray, isInt]), body: [returnStmt(boolLit(false))] },
    ];
    const result = applyKnownFacts(block, '$value', emptyFactEnv());
    const secondIf = result[1]!;
    expect(secondIf.kind).toBe('if');
    if (secondIf.kind !== 'if') {
      return;
    }
    expect(secondIf.cond).toEqual(boolLit(false));
  });

  it('flips true not fact into false on inner expr', () => {
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
    const outerIf = result[0]!;
    expect(outerIf.kind).toBe('if');
    if (outerIf.kind !== 'if') {
      return;
    }
    const innerIf = outerIf.body[0]!;
    expect(innerIf.kind).toBe('if');
    if (innerIf.kind !== 'if') {
      return;
    }
    expect(innerIf.cond).toEqual(boolLit(false));
  });

  it('applies De Morgan via not then or on true fact', () => {
    const isInt = callExpr('is_int', [refArg($v)]);
    const block: Block = [
      {
        kind: 'if',
        cond: notExpr(orExpr([isArray, isInt])),
        body: [returnStmt(orExpr([isArray, isInt]))],
      },
    ];
    const result = applyKnownFacts(block, '$value', emptyFactEnv());
    const outerIf = result[0]!;
    expect(outerIf.kind).toBe('if');
    if (outerIf.kind !== 'if') {
      return;
    }
    const ret = outerIf.body[0]!;
    expect(ret.kind).toBe('return');
    if (ret.kind !== 'return') {
      return;
    }
    expect(ret.expr).toEqual(boolLit(false));
  });
});

describe('blockAlwaysExitsWhenEntered', () => {
  it.each([
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
    [
      'early return on condition',
      [returnStmt(boolLit(true))],
      true,
    ],
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
          body: [{ kind: 'if', cond: callExpr('is_int', [refArg($v)]), body: [] }],
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
  ] as [string, Block, boolean][])('%s', (_name, block, expected) => {
    expect(blockAlwaysExitsWhenEntered(block)).toBe(expected);
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

  it('simplifies list guard follow-up when first branch returns true on and', () => {
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

  it('flips false not fact into true on inner expr after exiting if', () => {
    const block: Block = [
      { kind: 'if', cond: notExpr(isArray), body: [returnStmt(boolLit(true))] },
      { kind: 'if', cond: isArray, body: [returnStmt(boolLit(false))] },
    ];
    const result = applyKnownFacts(block, '$value', emptyFactEnv());
    const secondIf = result[1]!;
    expect(secondIf.kind).toBe('if');
    if (secondIf.kind !== 'if') {
      return;
    }
    expect(secondIf.cond).toEqual(boolLit(true));
  });

  it('records each disjunct as false after if on or with exiting body', () => {
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
    const secondIf = result[1]!;
    expect(secondIf.kind).toBe('if');
    if (secondIf.kind !== 'if') {
      return;
    }
    expect(secondIf.cond).toEqual(boolLit(false));
  });

  it('records each conjunct as true inside if with and condition', () => {
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
    const outerIf = result[0]!;
    expect(outerIf.kind).toBe('if');
    if (outerIf.kind !== 'if') {
      return;
    }
    const innerIf = outerIf.body[0]!;
    expect(innerIf.kind).toBe('if');
    if (innerIf.kind !== 'if') {
      return;
    }
    expect(innerIf.cond).toEqual(boolLit(true));
  });

  it('does not record false fact when if body can fall through', () => {
    const block: Block = [
      { kind: 'if', cond: isArray, body: [] },
      failIfStmt(isArray),
    ];
    const result = applyKnownFacts(block, '$value', emptyFactEnv());
    const secondIf = result[1]!;
    expect(secondIf.kind).toBe('if');
    if (secondIf.kind !== 'if') {
      return;
    }
    expect(equals(secondIf.cond, notExpr(isArray))).toBe(true);
  });
});
