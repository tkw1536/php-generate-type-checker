import { describe, expect, it } from 'vitest';
import {
  andExpr,
  binExpr,
  callExpr,
  literalArg,
  notExpr,
  refArg,
} from '../../ir/index.ts';
import { parameterRef } from '../../ir/index.ts';
import { equals } from '../../ir/equals.ts';
import { saturate, saturationHas } from './saturate.ts';

const $v = parameterRef();
const x = refArg($v);

describe('theory saturate', () => {
  it('derives is_object and exclusive ¬is_array from instanceof', () => {
    const sat = saturate([
      { kind: 'instanceof', subject: x, className: 'Foo' },
    ]);
    expect(saturationHas(sat, callExpr('is_object', [x]))).toBe(true);
    expect(saturationHas(sat, notExpr(callExpr('is_array', [x])))).toBe(true);
  });

  it('derives lower keys from list ∧ key_exists(N)', () => {
    const sat = saturate([
      andExpr([
        callExpr('array_is_list', [x]),
        callExpr('array_key_exists', [literalArg('2'), x]),
      ]),
    ]);
    expect(
      saturationHas(sat, callExpr('array_key_exists', [literalArg('0'), x])),
    ).toBe(true);
    expect(
      saturationHas(sat, callExpr('array_key_exists', [literalArg('1'), x])),
    ).toBe(true);
  });

  it('derives ¬list ∨ empty from ¬key_exists(0)', () => {
    const sat = saturate([
      notExpr(callExpr('array_key_exists', [literalArg('0'), x])),
    ]);
    const expected = {
      kind: 'or' as const,
      exprs: [
        notExpr(callExpr('array_is_list', [x])),
        binExpr('===', x, literalArg('[]')),
      ],
    };
    expect(sat.facts.some((f) => equals(f.expr, expected))).toBe(true);
  });
});
