import { describe, expect, it } from 'vitest';
import {
  binExpr,
  callExpr,
  literalArg,
  notExpr,
  refArg,
} from '../../ir/index.ts';
import { parameterRef } from '../../ir/index.ts';
import { P } from './pattern.builders.ts';
import { instantiateExpr } from './pattern.instantiate.ts';
import { emptySubst, matchExpr } from './pattern.ts';

const $v = parameterRef();

describe('theory patterns', () => {
  it('binds subjects across call match and instantiate', () => {
    const subst = matchExpr(
      P.call('is_int', [P.argVar('x')]),
      callExpr('is_int', [refArg($v)]),
      emptySubst(),
    );
    expect(subst).not.toBeNull();
    expect(
      instantiateExpr(P.call('is_object', [P.argVar('x')]), subst!),
    ).toEqual(callExpr('is_object', [refArg($v)]));
  });

  it('commutes === when requested', () => {
    const subst = matchExpr(
      P.bin('===', P.argVar('x'), P.lit('[]'), true),
      binExpr('===', literalArg('[]'), refArg($v)),
      emptySubst(),
    );
    expect(subst).not.toBeNull();
    expect(subst!.args.get('x')).toEqual(refArg($v));
  });

  it('binds non-neg int literals', () => {
    const subst = matchExpr(
      P.call('array_key_exists', [P.intLitVar('k'), P.argVar('x')]),
      callExpr('array_key_exists', [literalArg('2'), refArg($v)]),
      emptySubst(),
    );
    expect(subst?.ints.get('k')).toBe(2);
  });

  it('matches not(call)', () => {
    const subst = matchExpr(
      P.not(P.call('array_is_list', [P.argVar('x')])),
      notExpr(callExpr('array_is_list', [refArg($v)])),
      emptySubst(),
    );
    expect(subst).not.toBeNull();
  });
});
