import type { Arg, Expr, ValueRef } from '../ir/types.ts';

/** Lower runs earlier in && / || (type proofs before member checks). */
function operandPriority(expr: Expr): number {
  switch (expr.kind) {
    case 'instanceof':
      return argTouchesMember(expr.subject) ? 3 : 0;
    case 'call':
      return callOperandPriority(expr);
    case 'bool':
    case 'bin':
    case 'call_checker':
    case 'not':
    case 'and':
    case 'or':
      return 3;
    default:
      throw new Error('never reached');
  }
}

function callOperandPriority(
  expr: Extract<Expr, { kind: 'call' }>,
): number {
  if (expr.args.some(argTouchesMember)) {
    return 3;
  }
  const { name } = expr;
  if (name === 'array_is_list') {
    return 1;
  }
  if (
    name === 'property_exists' ||
    name === 'array_key_exists' ||
    name === 'is_callable'
  ) {
    return 2;
  }
  if (name.startsWith('is_')) {
    return 1;
  }
  return 3;
}

function argTouchesMember(arg: Arg): boolean {
  switch (arg.kind) {
    case 'literal':
      return false;
    case 'ref':
      return valueRefTouchesMember(arg.ref);
    case 'call':
      return arg.args.some(argTouchesMember);
    default:
      throw new Error('never reached');
  }
}

function valueRefTouchesMember(ref: ValueRef): boolean {
  switch (ref.kind) {
    case 'variable':
      return false;
    case 'array_access':
    case 'property_access':
      return true;
    default:
      throw new Error('never reached');
  }
}

type RankedOperand = {
  readonly expr: Expr;
  readonly index: number;
  readonly priority: number;
};

export function sortOperands(exprs: readonly Expr[]): Expr[] {
  const ranked: readonly RankedOperand[] = exprs.map((expr, index) => ({
    expr,
    index,
    priority: operandPriority(expr),
  }));
  return ranked
    .toSorted(
      (a: RankedOperand, b: RankedOperand) =>
        a.priority - b.priority || a.index - b.index,
    )
    .map((entry) => entry.expr);
}
