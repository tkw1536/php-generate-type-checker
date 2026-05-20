import type { BinOp, Block, Expr, Stmt } from '../ir/types.ts';
import { andExpr, boolLit, notExpr, orExpr } from '../ir/index.ts';
import { equals } from '../ir/equals.ts';
import type { OptimizerParams } from './params.ts';

const POSITIVE_BIN_OPS: ReadonlySet<BinOp> = new Set(['===', '==', '<=', '>=']);

export function simplify(block: Block, params: OptimizerParams): Block {
  return block.map((stmt) => simplifyStatement(stmt, params));
}

function simplifyStatement(stmt: Stmt, params: OptimizerParams): Stmt {
  switch (stmt.kind) {
    case 'if':
      return {
        kind: 'if',
        cond: simplifyExpression(stmt.cond, params),
        body: simplify(stmt.body, params),
      };
    case 'foreach':
      return {
        ...stmt,
        body: simplify(stmt.body, params),
      };
    case 'return':
      return {
        kind: 'return',
        expr: simplifyExpression(stmt.expr, params),
      };
    default:
      return stmt;
  }
}

export function simplifyExpression(expr: Expr, params: OptimizerParams): Expr {
  let current = expandBinOps(expr);
  for (let i = 0; i < params.maxExpressionSimplificationLoops; i++) {
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
  if (inner.kind === 'bool') {
    return boolLit(!inner.value);
  }
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
  const factored = factorAndOfOrs(flat);
  if (factored !== null) {
    return normalizeOr(factored.exprs);
  }
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
  const factored = factorOrOfAnds(flat);
  if (factored !== null) {
    return normalizeAnd(factored.exprs);
  }
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

function conjunctsOf(expr: Expr): Expr[] {
  if (expr.kind === 'and') {
    return flattenAnd(expr.exprs);
  }
  return [expr];
}

function disjunctsOf(expr: Expr): Expr[] {
  if (expr.kind === 'or') {
    return flattenOr(expr.exprs);
  }
  return [expr];
}

function exprInList(expr: Expr, list: Expr[]): boolean {
  return list.some((e) => equals(e, expr));
}

function intersectOperands(armLists: Expr[][]): Expr[] {
  if (armLists.length === 0) {
    return [];
  }
  const [first, ...rest] = armLists;
  return first!.filter((operand) =>
    rest.every((arm) => exprInList(operand, arm)),
  );
}

function subtractOperands(arm: Expr[], common: Expr[]): Expr[] {
  return arm.filter((operand) => !common.some((c) => equals(c, operand)));
}

function remainderAndExpr(remainder: Expr[]): Expr {
  if (remainder.length === 0) {
    return boolLit(true);
  }
  if (remainder.length === 1) {
    return remainder[0]!;
  }
  return andExpr(remainder);
}

function remainderOrExpr(remainder: Expr[]): Expr {
  if (remainder.length === 0) {
    return boolLit(false);
  }
  if (remainder.length === 1) {
    return remainder[0]!;
  }
  return orExpr(remainder);
}

function allRemaindersEmpty(armLists: Expr[][], common: Expr[]): boolean {
  return armLists.every((arm) => subtractOperands(arm, common).length === 0);
}

function factorOrOfAnds(exprs: Expr[]): Extract<Expr, { kind: 'and' }> | null {
  if (exprs.length < 2) {
    return null;
  }
  const armLists = exprs.map(conjunctsOf);
  const common = intersectOperands(armLists);
  if (common.length === 0) {
    return null;
  }
  const remainders = armLists.map((arm) => subtractOperands(arm, common));
  // When any arm is exactly the shared conjuncts (empty remainder),
  // (C∧R₁) ∨ … ∨ (C∧Rₖ) ∨ C ≡ C — do not build or(…, true) from empty
  // remainders or normalizeOr will drop other arms' constraints unsoundly.
  if (remainders.some((r) => r.length === 0)) {
    return { kind: 'and', exprs: common };
  }
  const remainderOr = orExpr(
    remainders.map((r) => remainderAndExpr(r)),
  );
  return { kind: 'and', exprs: [...common, remainderOr] };
}

function factorAndOfOrs(exprs: Expr[]): Extract<Expr, { kind: 'or' }> | null {
  if (exprs.length < 2) {
    return null;
  }
  const armLists = exprs.map(disjunctsOf);
  const common = intersectOperands(armLists);
  if (common.length === 0) {
    return null;
  }
  if (allRemaindersEmpty(armLists, common)) {
    return { kind: 'or', exprs: common };
  }
  const remainderAnd = andExpr(
    armLists.map((arm) => remainderOrExpr(subtractOperands(arm, common))),
  );
  return { kind: 'or', exprs: [...common, remainderAnd] };
}
