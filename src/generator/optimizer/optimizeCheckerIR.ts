/**
 * Optimize checker IR (structural cleanup):
 * 1. Drop no-op failIf checks (empty decomposition).
 * 2. Dedupe identical failIf checks.
 * 3. Hoist all failIf before optional/foreach at each nesting level — skipped when
 *    {@link OptimizeCheckerIRInput.preserveStatementOrder} is true (separate-`if` emit mode).
 */
import {
  type Check,
  type CheckerProgram,
  type CheckerStmt,
  checkEquals,
} from '../checkerIR.ts';

export type OptimizeCheckerIRInput = {
  /**
   * When true, do not reorder statements (no failIf hoisting). Use with readability-priority
   * emit so each `if` stays in the order the builder produced.
   */
  preserveStatementOrder?: boolean;
};

export class IROptimizer {
  private readonly input: OptimizeCheckerIRInput | undefined;

  constructor(input?: OptimizeCheckerIRInput) {
    this.input = input;
  }

  optimize(program: CheckerProgram): CheckerProgram {
    return {
      ...program,
      statements: this.optimizeStatementList(program.statements, program.parameter),
    };
  }

  private optimizeStatementList(
    statements: CheckerStmt[],
    parameter: string,
  ): CheckerStmt[] {
    let stmts = statements.map((s) => this.optimizeStmt(s, parameter));
    stmts = this.dropNoOpFailIf(stmts);
    stmts = this.dedupeFailIfStatements(stmts);
    if (!this.input?.preserveStatementOrder) {
      stmts = this.hoistFailIfBeforeControlFlow(stmts);
    }
    return stmts;
  }

  private optimizeStmt(stmt: CheckerStmt, parameter: string): CheckerStmt {
    switch (stmt.kind) {
      case 'optional':
        return {
          ...stmt,
          body: this.optimizeStatementList(stmt.body, parameter),
        };
      case 'foreach':
        return {
          ...stmt,
          body: this.optimizeStatementList(stmt.body, parameter),
        };
      default:
        return stmt;
    }
  }

  private dropNoOpFailIf(stmts: CheckerStmt[]): CheckerStmt[] {
    return stmts.filter((s) => {
      if (s.kind !== 'failIf') {
        return true;
      }
      return !this.isNoOpCheck(s.check);
    });
  }

  private isNoOpCheck(_check: Check): boolean {
    return false;
  }

  private dedupeFailIfStatements(stmts: CheckerStmt[]): CheckerStmt[] {
    const out: CheckerStmt[] = [];
    for (const stmt of stmts) {
      if (stmt.kind !== 'failIf') {
        out.push(stmt);
        continue;
      }
      const duplicate = out.some(
        (s) => s.kind === 'failIf' && checkEquals(s.check, stmt.check),
      );
      if (!duplicate) {
        out.push(stmt);
      }
    }
    return out;
  }

  private hoistFailIfBeforeControlFlow(stmts: CheckerStmt[]): CheckerStmt[] {
    const failIfs: CheckerStmt[] = [];
    const failUnless: CheckerStmt[] = [];
    const middle: CheckerStmt[] = [];
    const tail: CheckerStmt[] = [];

    for (const stmt of stmts) {
      if (stmt.kind === 'failIf' || stmt.kind === 'failUnlessMatch') {
        if (stmt.kind === 'failIf') {
          failIfs.push(stmt);
        } else {
          failUnless.push(stmt);
        }
      } else if (stmt.kind === 'optional' || stmt.kind === 'foreach') {
        middle.push(stmt);
      } else {
        tail.push(stmt);
      }
    }

    return [...failIfs, ...failUnless, ...middle, ...tail];
  }
}

export function optimizeCheckerIR(
  program: CheckerProgram,
  input?: OptimizeCheckerIRInput,
): CheckerProgram {
  return new IROptimizer(input).optimize(program);
}
