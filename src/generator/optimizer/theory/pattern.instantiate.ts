/** Build concrete IR exprs/args from patterns + substitution. */
import type { Arg, Expr, ValueRef } from '../../ir/types.ts';
import {
  andExpr,
  binExpr,
  boolLit,
  callArg,
  callCheckerExpr,
  callExpr,
  instanceofExpr,
  literalArg,
  notExpr,
  orExpr,
  refArg,
} from '../../ir/index.ts';
import type {
  ArgPattern,
  ExprPattern,
  Subst,
  ValueRefPattern,
} from './pattern.types.ts';

function instantiateValueRef(pattern: ValueRefPattern, subst: Subst): ValueRef {
  switch (pattern.kind) {
    case 'any':
      throw new Error('cannot instantiate wildcard');
    case 'var': {
      const a = subst.args.get(pattern.name);
      if (a === undefined || a.kind !== 'ref') {
        throw new Error(`unbound ref var ${pattern.name}`);
      }
      return a.ref;
    }
    case 'parameter':
      return { kind: 'parameter' };
    case 'variable':
      return { kind: 'variable', id: pattern.id };
    default:
      throw new Error('never reached');
  }
}

export function instantiateArg(pattern: ArgPattern, subst: Subst): Arg {
  switch (pattern.kind) {
    case 'var': {
      const a = subst.args.get(pattern.name);
      if (a === undefined) {
        throw new Error(`unbound arg var ${pattern.name}`);
      }
      return a;
    }
    case 'any':
      throw new Error('cannot instantiate wildcard');
    case 'lit':
      return literalArg(pattern.value);
    case 'litVar': {
      const v = subst.literals.get(pattern.name);
      if (v === undefined) {
        throw new Error(`unbound literal var ${pattern.name}`);
      }
      return literalArg(v);
    }
    case 'intLitVar': {
      const n = subst.ints.get(pattern.name);
      if (n === undefined) {
        throw new Error(`unbound int var ${pattern.name}`);
      }
      return literalArg(String(n));
    }
    case 'call':
      return callArg(
        pattern.name,
        pattern.args.map((a) => instantiateArg(a, subst)),
      );
    case 'ref':
      return refArg(instantiateValueRef(pattern.ref, subst));
    default:
      throw new Error('never reached');
  }
}

function instantiateLeafExpr(pattern: ExprPattern, subst: Subst): Expr {
  switch (pattern.kind) {
    case 'var': {
      const e = subst.exprs.get(pattern.name);
      if (e === undefined) {
        throw new Error(`unbound expr var ${pattern.name}`);
      }
      return e;
    }
    case 'any':
      throw new Error('cannot instantiate wildcard');
    case 'bool':
      return boolLit(pattern.value);
    case 'call':
      return callExpr(
        pattern.name,
        pattern.args.map((a) => instantiateArg(a, subst)),
      );
    case 'bin':
      return binExpr(
        pattern.op,
        instantiateArg(pattern.left, subst),
        instantiateArg(pattern.right, subst),
      );
    case 'instanceof': {
      if (pattern.className === null) {
        throw new Error('cannot instantiate instanceof without className');
      }
      return instanceofExpr(
        instantiateArg(pattern.subject, subst),
        pattern.className,
      );
    }
    case 'call_checker': {
      if (pattern.name === null) {
        throw new Error('cannot instantiate call_checker without name');
      }
      return callCheckerExpr(
        pattern.name,
        instantiateValueRef(pattern.subject, subst),
      );
    }
    case 'not':
    case 'and':
    case 'or':
      throw new Error('never reached');
    default:
      throw new Error('never reached');
  }
}

export function instantiateExpr(pattern: ExprPattern, subst: Subst): Expr {
  if (pattern.kind === 'not') {
    return notExpr(instantiateExpr(pattern.expr, subst));
  }
  if (pattern.kind === 'and') {
    return andExpr(pattern.exprs.map((p) => instantiateExpr(p, subst)));
  }
  if (pattern.kind === 'or') {
    return orExpr(pattern.exprs.map((p) => instantiateExpr(p, subst)));
  }
  return instantiateLeafExpr(pattern, subst);
}
