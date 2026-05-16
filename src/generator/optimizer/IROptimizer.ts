import type { Block, CheckerIR, Expr, Stmt } from '../ir/types.ts';
import { andExpr, returnStmt } from '../ir/';
import { equals } from '../ir/equals.ts';
import { failIfOrChainStmt, isFailIfStmt, parseFailIfGuard } from './failIf.ts';

export class IROptimizer {
  optimize(ir: CheckerIR): CheckerIR {
    const programs: CheckerIR['programs'] = {};
    for (const name of Object.keys(ir.programs)) {
      const program = ir.programs[name]!;
      programs[name] = {
        ...program,
        body: this.optimizeBlock(program.body),
      };
    }
    return { order: [...ir.order], programs };
  }

  private optimizeBlock(block: Block): Block {
    let stmts = block.map((s) => this.optimizeStmt(s));
    stmts = this.dedupeFailIf(stmts);
    stmts = this.mergeFailIf(stmts);
    stmts = this.hoistFailIf(stmts);
    stmts = this.foldTrailingFailIf(stmts);
    stmts = this.simplifyBlock(stmts);
    return stmts;
  }

  private optimizeStmt(stmt: Stmt): Stmt {
    switch (stmt.kind) {
      case 'if':
        return { ...stmt, body: this.optimizeBlock(stmt.body) };
      case 'foreach':
        return { ...stmt, body: this.optimizeBlock(stmt.body) };
      default:
        return stmt;
    }
  }

  private dedupeFailIf(stmts: Stmt[]): Stmt[] {
    const out: Stmt[] = [];
    for (const stmt of stmts) {
      const guard = parseFailIfGuard(stmt);
      if (guard === null) {
        out.push(stmt);
        continue;
      }
      const dup = out.some((s) => {
        const g = parseFailIfGuard(s);
        return g !== null && equals(g, guard);
      });
      if (!dup) {
        out.push(stmt);
      }
    }
    return out;
  }

  private mergeFailIf(stmts: Stmt[]): Stmt[] {
    const out: Stmt[] = [];
    let i = 0;
    while (i < stmts.length) {
      const guard = parseFailIfGuard(stmts[i]!);
      if (guard === null) {
        out.push(stmts[i]!);
        i++;
        continue;
      }
      const guards: Expr[] = [guard];
      let j = i + 1;
      while (j < stmts.length) {
        const g = parseFailIfGuard(stmts[j]!);
        if (g === null) {
          break;
        }
        guards.push(g);
        j++;
      }
      if (guards.length === 1) {
        out.push(stmts[i]!);
      } else {
        out.push(failIfOrChainStmt(guards));
      }
      i = j;
    }
    return out;
  }

  private hoistFailIf(stmts: Stmt[]): Stmt[] {
    const failIfs: Stmt[] = [];
    const middle: Stmt[] = [];
    const tail: Stmt[] = [];

    for (const stmt of stmts) {
      if (isFailIfStmt(stmt)) {
        failIfs.push(stmt);
      } else if (stmt.kind === 'if' || stmt.kind === 'foreach') {
        middle.push(stmt);
      } else {
        tail.push(stmt);
      }
    }
    return [...failIfs, ...middle, ...tail];
  }

  private foldTrailingFailIf(stmts: Stmt[]): Stmt[] {
    if (stmts.length === 0) {
      return stmts;
    }
    const last = stmts[stmts.length - 1]!;
    if (
      last.kind !== 'return' ||
      last.expr.kind !== 'bool' ||
      last.expr.value !== true
    ) {
      return stmts;
    }
    const guards: Expr[] = [];
    let i = stmts.length - 2;
    while (i >= 0) {
      const g = parseFailIfGuard(stmts[i]!);
      if (g === null) {
        break;
      }
      guards.unshift(g);
      i--;
    }
    if (guards.length === 0) {
      return stmts;
    }
    return [
      ...stmts.slice(0, i + 1),
      returnStmt(guards.length === 1 ? guards[0]! : andExpr(guards)),
    ];
  }

  private simplifyBlock(stmts: Stmt[]): Stmt[] {
    return stmts.map((s) => this.simplifyStmt(s));
  }

  private simplifyStmt(stmt: Stmt): Stmt {
    if (stmt.kind === 'if') {
      return { ...stmt, cond: this.simplifyExpr(stmt.cond), body: this.simplifyBlock(stmt.body) };
    }
    if (stmt.kind === 'foreach') {
      return { ...stmt, body: this.simplifyBlock(stmt.body) };
    }
    if (stmt.kind === 'return') {
      return { ...stmt, expr: this.simplifyExpr(stmt.expr) };
    }
    return stmt;
  }

  private simplifyExpr(expr: Expr): Expr {
    switch (expr.kind) {
      case 'not':
        if (expr.expr.kind === 'not') {
          return this.simplifyExpr(expr.expr.expr);
        }
        return { kind: 'not', expr: this.simplifyExpr(expr.expr) };
      case 'and': {
        const flat = this.flattenAnd(expr.exprs.map((e) => this.simplifyExpr(e)));
        if (flat.length === 1) {
          return flat[0]!;
        }
        return { kind: 'and', exprs: flat };
      }
      case 'or': {
        const flat = this.flattenOr(expr.exprs.map((e) => this.simplifyExpr(e)));
        if (flat.length === 1) {
          return flat[0]!;
        }
        return { kind: 'or', exprs: flat };
      }
      default:
        return expr;
    }
  }

  private flattenAnd(exprs: Expr[]): Expr[] {
    const out: Expr[] = [];
    for (const e of exprs) {
      if (e.kind === 'and') {
        out.push(...this.flattenAnd(e.exprs));
      } else {
        out.push(e);
      }
    }
    return out;
  }

  private flattenOr(exprs: Expr[]): Expr[] {
    const out: Expr[] = [];
    for (const e of exprs) {
      if (e.kind === 'or') {
        out.push(...this.flattenOr(e.exprs));
      } else {
        out.push(e);
      }
    }
    return out;
  }
}

export function optimize(ir: CheckerIR): CheckerIR {
  return new IROptimizer().optimize(ir);
}
