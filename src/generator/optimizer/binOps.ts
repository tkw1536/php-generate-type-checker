import type { BinOp, Expr } from '../ir/types.ts';
import { notExpr } from '../ir/index.ts';

const POSITIVE_BIN_OPS: ReadonlySet<BinOp> = new Set(['===', '==', '<=', '>=']);

function isPositiveBinOp(op: BinOp): boolean {
  return POSITIVE_BIN_OPS.has(op);
}

export function negateBinOp(op: BinOp): BinOp {
  switch (op) {
    case '===':
      return '!==';
    case '!==':
      return '===';
    case '==':
      return '!=';
    case '!=':
      return '==';
    case '>':
      return '<=';
    case '<':
      return '>=';
    case '>=':
      return '<';
    case '<=':
      return '>';
    default:
      throw new Error('never reached');
  }
}

type BinExpr = Extract<Expr, { kind: 'bin' }>;

export function expandBinOp(bin: BinExpr): Expr {
  if (isPositiveBinOp(bin.op)) {
    return bin;
  }
  return notExpr({
    kind: 'bin',
    op: negateBinOp(bin.op),
    left: bin.left,
    right: bin.right,
  });
}

export function expandBinOps(expr: Expr): Expr {
  switch (expr.kind) {
    case 'not':
      return { kind: 'not', expr: expandBinOps(expr.expr) };
    case 'and':
      return { kind: 'and', exprs: expr.exprs.map((e) => expandBinOps(e)) };
    case 'or':
      return { kind: 'or', exprs: expr.exprs.map((e) => expandBinOps(e)) };
    case 'bin':
      return expandBinOp(expr);
    case 'bool':
    case 'call':
    case 'call_checker':
    case 'instanceof':
      return expr;
    default:
      throw new Error('never reached');
  }
}

export function absorbBinOp(expr: Expr): Expr {
  if (expr.kind === 'not' && expr.expr.kind === 'bin') {
    const bin = expr.expr;
    return {
      kind: 'bin',
      op: negateBinOp(bin.op),
      left: bin.left,
      right: bin.right,
    };
  }
  return expr;
}

export function absorbBinOps(expr: Expr): Expr {
  switch (expr.kind) {
    case 'not': {
      const inner = absorbBinOps(expr.expr);
      return absorbBinOp({ kind: 'not', expr: inner });
    }
    case 'and':
      return { kind: 'and', exprs: expr.exprs.map((e) => absorbBinOps(e)) };
    case 'or':
      return { kind: 'or', exprs: expr.exprs.map((e) => absorbBinOps(e)) };
    case 'bin':
    case 'bool':
    case 'call':
    case 'call_checker':
    case 'instanceof':
      return absorbBinOp(expr);
    default:
      throw new Error('never reached');
  }
}
