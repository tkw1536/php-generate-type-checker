/**
 * Instantiate theory conclusions (templates + generative schemas).
 */
import type { Arg, Expr } from '../../ir/types.ts';
import {
  binExpr,
  callExpr,
  literalArg,
  notExpr,
} from '../../ir/index.ts';
import {
  EXCLUSIVE_IS_CALLS,
  exclusiveCallNameForLiteral,
} from '../lib/exclusiveTypes.ts';
import { instantiateExpr } from './pattern.instantiate.ts';
import type { Subst } from './pattern.types.ts';
import type { TheoryConclusion } from './types.ts';

function requireArg(subst: Subst, name: string): Arg {
  const a = subst.args.get(name);
  if (a === undefined) {
    throw new Error(`unbound arg ${name}`);
  }
  return a;
}

function exclusiveNegations(
  subject: Arg,
  skipCallName: string | undefined,
  skipNull: boolean,
): readonly Expr[] {
  const out: Expr[] = [];
  for (const name of EXCLUSIVE_IS_CALLS) {
    if (skipCallName === name) {
      continue;
    }
    out.push(notExpr(callExpr(name, [subject])));
  }
  if (!skipNull) {
    out.push(notExpr(binExpr('===', subject, literalArg('null'))));
  }
  return out;
}

function keysBelow(subject: Arg, n: number): readonly Expr[] {
  const out: Expr[] = [];
  for (let k = 0; k < n; k++) {
    out.push(callExpr('array_key_exists', [literalArg(String(k)), subject]));
  }
  return out;
}

/** Expand one conclusion under a successful premise match. */
export function expandConclusion(
  conclusion: TheoryConclusion,
  subst: Subst,
): readonly Expr[] {
  switch (conclusion.kind) {
    case 'pattern':
      return [instantiateExpr(conclusion.pattern, subst)];
    case 'exclusiveNegations':
      return exclusiveNegations(
        requireArg(subst, conclusion.subject),
        conclusion.skipCallName,
        conclusion.skipNull === true,
      );
    case 'keysBelow': {
      const n = subst.ints.get(conclusion.n);
      if (n === undefined) {
        throw new Error(`unbound int ${conclusion.n}`);
      }
      return keysBelow(requireArg(subst, conclusion.subject), n);
    }
    case 'equalityTypeCall': {
      const lit = subst.literals.get(conclusion.lit);
      if (lit === undefined) {
        throw new Error(`unbound literal ${conclusion.lit}`);
      }
      const name = exclusiveCallNameForLiteral(lit);
      if (name === null) {
        return [];
      }
      return [callExpr(name, [requireArg(subst, conclusion.subject)])];
    }
    default:
      throw new Error('never reached');
  }
}
