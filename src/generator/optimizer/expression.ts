import type { BinOp, Block, Expr, Stmt } from '../ir/types.ts';
import { andExpr, boolLit, notExpr, orExpr } from '../ir/index.ts';
import { equals } from '../ir/equals.ts';

const POSITIVE_BIN_OPS: ReadonlySet<BinOp> = new Set(['===', '==', '<=', '>=']);

export function simplify(block: Block): Block {
  return block.map((stmt) => simplifyStatement(stmt));
}

function simplifyStatement(stmt: Stmt): Stmt {
  switch (stmt.kind) {
    case 'if':
      return {
        kind: 'if',
        cond: simplifyExpression(stmt.cond),
        body: simplify(stmt.body),
      };
    case 'foreach':
      return {
        ...stmt,
        body: simplify(stmt.body),
      };
    case 'return':
      return {
        kind: 'return',
        expr: simplifyExpression(stmt.expr),
      };
    default:
      return stmt;
  }
}

const MAX_SIMPLIFICATION_ITERATIONS = 32;

export function simplifyExpression(expr: Expr): Expr {
  let current = expandBinOps(expr);
  for (let i = 0; i < MAX_SIMPLIFICATION_ITERATIONS; i++) {
    const next = normalizeExpr(current);
    if (equals(current, next)) {
      break;
    }
    current = next;
  }
  return absorbBinOps(current);
}

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
      return { kind: 'and', exprs: expr.exprs.map(expandBinOps) };
    case 'or':
      return { kind: 'or', exprs: expr.exprs.map(expandBinOps) };
    case 'bin':
      return expandBinOp(expr);
    default:
      return expr;
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
      return { kind: 'and', exprs: expr.exprs.map(absorbBinOps) };
    case 'or':
      return { kind: 'or', exprs: expr.exprs.map(absorbBinOps) };
    default:
      return absorbBinOp(expr);
  }
}

function normalizeExpr(expr: Expr): Expr {
  switch (expr.kind) {
    case 'not':
      return normalizeNot(expr);
    case 'and':
      return normalizeAnd(expr.exprs);
    case 'or':
      return normalizeOr(expr.exprs);
    default:
      return expr;
  }
}

function normalizeNot(expr: Extract<Expr, { kind: 'not' }>): Expr {
  const inner = normalizeExpr(expr.expr);
  if (inner.kind === 'not') {
    return normalizeExpr(inner.expr);
  }
  if (inner.kind === 'and') {
    return normalizeExpr(orExpr(inner.exprs.map((e) => notExpr(e))));
  }
  if (inner.kind === 'or') {
    return normalizeExpr(andExpr(inner.exprs.map((e) => notExpr(e))));
  }
  return { kind: 'not', expr: inner };
}

function normalizeAnd(exprs: Expr[]): Expr {
  let flat = flattenAnd(exprs.map((e) => normalizeExpr(e)));
  if (flat.some((e) => e.kind === 'bool' && !e.value)) {
    return boolLit(false);
  }
  flat = flat.filter((e) => !(e.kind === 'bool' && e.value));
  if (flat.length === 0) {
    return boolLit(true);
  }
  flat = dedupeOperands(flat);
  if (hasContradiction(flat)) {
    return boolLit(false);
  }
  if (flat.length === 1) {
    return flat[0]!;
  }
  return { kind: 'and', exprs: flat };
}

function normalizeOr(exprs: Expr[]): Expr {
  let flat = flattenOr(exprs.map((e) => normalizeExpr(e)));
  if (flat.some((e) => e.kind === 'bool' && e.value)) {
    return boolLit(true);
  }
  flat = flat.filter((e) => !(e.kind === 'bool' && !e.value));
  if (flat.length === 0) {
    return boolLit(false);
  }
  flat = dedupeOperands(flat);
  if (hasTautology(flat)) {
    return boolLit(true);
  }
  if (flat.length === 1) {
    return flat[0]!;
  }
  return { kind: 'or', exprs: flat };
}

function dedupeOperands(exprs: Expr[]): Expr[] {
  const out: Expr[] = [];
  for (const e of exprs) {
    if (!out.some((prev) => equals(prev, e))) {
      out.push(e);
    }
  }
  return out;
}

function negatedInner(expr: Expr): Expr | null {
  return expr.kind === 'not' ? expr.expr : null;
}

function hasContradiction(exprs: Expr[]): boolean {
  for (let i = 0; i < exprs.length; i++) {
    for (let j = i + 1; j < exprs.length; j++) {
      const a = exprs[i]!;
      const b = exprs[j]!;
      const na = negatedInner(a);
      const nb = negatedInner(b);
      if (na !== null && equals(na, b)) {
        return true;
      }
      if (nb !== null && equals(nb, a)) {
        return true;
      }
    }
  }
  return false;
}

function hasTautology(exprs: Expr[]): boolean {
  return hasContradiction(exprs);
}

function flattenAnd(exprs: Expr[]): Expr[] {
  const out: Expr[] = [];
  for (const e of exprs) {
    if (e.kind === 'and') {
      out.push(...flattenAnd(e.exprs));
    } else {
      out.push(e);
    }
  }
  return out;
}

function flattenOr(exprs: Expr[]): Expr[] {
  const out: Expr[] = [];
  for (const e of exprs) {
    if (e.kind === 'or') {
      out.push(...flattenOr(e.exprs));
    } else {
      out.push(e);
    }
  }
  return out;
}
