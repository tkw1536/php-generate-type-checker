import type { Arg, Expr, ValueRef } from '../../../ir/types.ts';

/**
 * Lower runs earlier in && / ||:
 * type proofs → non-member count compares → key/exists → member checks.
 */
function operandPriority(expr: Expr): number {
  switch (expr.kind) {
    case 'instanceof':
      return argTouchesMember(expr.subject) ? 4 : 0;
    case 'call':
      return callOperandPriority(expr);
    case 'bin':
      return binOperandPriority(expr);
    case 'bool':
    case 'call_checker':
    case 'not':
    case 'and':
    case 'or':
      return 4;
    default:
      throw new Error('never reached');
  }
}

function callOperandPriority(
  expr: Extract<Expr, { kind: 'call' }>,
): number {
  if (expr.args.some(argTouchesMember)) {
    return 4;
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
    return 3;
  }
  if (name.startsWith('is_')) {
    return 1;
  }
  return 4;
}

/** `count($x) === N` / `!==` (either operand order) when `$x` is non-member. */
function binOperandPriority(expr: Extract<Expr, { kind: 'bin' }>): number {
  if (expr.op !== '===' && expr.op !== '!==') {
    return 4;
  }
  const countArg =
    countCallSoleArg(expr.left) ?? countCallSoleArg(expr.right);
  if (countArg === null) {
    return 4;
  }
  return argTouchesMember(countArg) ? 4 : 2;
}

function countCallSoleArg(arg: Arg): Arg | null {
  if (arg.kind !== 'call' || arg.name !== 'count' || arg.args.length !== 1) {
    return null;
  }
  return arg.args[0] ?? null;
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
    case 'parameter':
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
