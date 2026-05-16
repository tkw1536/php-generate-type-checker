/**
 * Emit checker IR to PhpLine[]:
 * 1. Walk statements at each nesting level.
 * 2. Batch consecutive failIf into one negated OR if (unless readability mode).
 * 3. Emit optional / foreach / returnIf / returnOr / returnTrue.
 */
import {
  type CheckerProgram,
  type CheckerStmt,
  valueRefToPath,
} from '../checkerIR.ts';
import {
  type PhpLine,
  ifBlock,
  ifBlockMultilineOr,
  ifBlockOrChain,
  line,
  shiftLines,
} from './context.ts';
import {
  renderAtom,
  renderFailAtom,
  renderFailUnlessMatch,
} from './renderCheck.ts';

export type EmitCheckerIRInput = {
  prioritizeReadabilityOverCompactness?: boolean;
};

type LoopBinding = { keyVar: string | null; valueVar: string };

export class CheckerIREmitter {
  private readonly loopVars = new Map<string, LoopBinding>();
  private readonly parameter: string;
  private readonly alwaysEmitIfConditions: boolean;

  constructor(parameter: string, prioritizeReadabilityOverCompactness = false) {
    this.parameter = parameter;
    this.alwaysEmitIfConditions = prioritizeReadabilityOverCompactness;
  }

  emit(program: CheckerProgram): PhpLine[] {
    const lines = this.emitStatementList(program.statements, 0);
    const lastKind = program.statements[program.statements.length - 1]?.kind;
    if (lastKind === 'returnTrue') {
      lines.push(line(0, 'return true;'));
    } else if (lastKind !== 'returnIf' && lastKind !== 'returnOr') {
      lines.push(line(0, 'return true;'));
    }
    return lines;
  }

  private withLoopBinding(
    loopId: string,
    binding: LoopBinding,
    fn: () => PhpLine[],
  ): PhpLine[] {
    this.loopVars.set(loopId, binding);
    try {
      return fn();
    } finally {
      this.loopVars.delete(loopId);
    }
  }

  private emitStatementList(statements: CheckerStmt[], depth: number): PhpLine[] {
    const out: PhpLine[] = [];
    let i = 0;
    while (i < statements.length) {
      const stmt = statements[i]!;
      if (stmt.kind === 'failIf') {
        const run: CheckerStmt[] = [];
        while (i < statements.length && statements[i]!.kind === 'failIf') {
          run.push(statements[i]!);
          i++;
        }
        out.push(...this.emitFailIfRun(run, depth));
        continue;
      }
      if (stmt.kind === 'failUnlessMatch') {
        out.push(
          ...ifBlock(depth, renderFailUnlessMatch(stmt.arms), [
            line(0, 'return false;'),
          ]),
        );
        i++;
        continue;
      }
      if (stmt.kind === 'returnIf') {
        out.push(line(depth, `return ${renderAtom(stmt.check)};`));
        i++;
        continue;
      }
      if (stmt.kind === 'returnTrue') {
        i++;
        continue;
      }
      if (stmt.kind === 'returnOr') {
        out.push(line(depth, `return ${this.renderReturnOr(stmt.arms)};`));
        i++;
        continue;
      }
      if (stmt.kind === 'optional') {
        out.push(...this.emitOptionalBlock(stmt, depth));
        i++;
        continue;
      }
      if (stmt.kind === 'foreach') {
        out.push(...this.emitForeachBlock(stmt, depth));
        i++;
        continue;
      }
      i++;
    }
    return out;
  }

  private emitFailIfRun(
    run: CheckerStmt[],
    depth: number,
  ): PhpLine[] {
    const checks = run
      .filter((s): s is Extract<CheckerStmt, { kind: 'failIf' }> => s.kind === 'failIf')
      .map((s) => s.check);
    if (checks.length === 0) {
      return [];
    }
    const body = [line(0, 'return false;')];
    if (this.alwaysEmitIfConditions) {
      const blocks: PhpLine[] = [];
      for (const check of checks) {
        blocks.push(...ifBlock(depth, renderFailAtom(check), body));
      }
      return blocks;
    }
    const parts = checks.map((c) => renderFailAtom(c));
    if (parts.length === 1) {
      return ifBlock(depth, parts[0]!, body);
    }
    const useMultiline = parts.some((p) => p.length > 48);
    if (useMultiline) {
      return ifBlockMultilineOr(depth, parts, body);
    }
    return ifBlockOrChain(depth, parts, body);
  }

  private renderReturnOr(
    arms: Extract<CheckerStmt, { kind: 'returnOr' }>['arms'],
  ): string {
    const parts: string[] = [];
    for (const arm of arms) {
      if (arm.kind === 'checkerCall') {
        parts.push(arm.callExpression);
      } else {
        parts.push(renderAtom(arm.check));
      }
    }
    return parts.join(' || ');
  }

  private emitOptionalBlock(
    stmt: Extract<CheckerStmt, { kind: 'optional' }>,
    depth: number,
  ): PhpLine[] {
    const containerPath = valueRefToPath(stmt.ref, this.parameter, this.loopVars);
    const keyLit = phpStringLiteral(stmt.key);
    const cond = stmt.objectShape
      ? `property_exists(${containerPath}, ${keyLit})`
      : `array_key_exists(${keyLit}, ${containerPath})`;
    const body = this.emitStatementList(stmt.body, 0);
    return ifBlock(depth, cond, body);
  }

  private emitForeachBlock(
    stmt: Extract<CheckerStmt, { kind: 'foreach' }>,
    depth: number,
  ): PhpLine[] {
    const iterablePath = valueRefToPath(
      stmt.iterable,
      this.parameter,
      this.loopVars,
    );
    const body = this.withLoopBinding(
      stmt.loopId,
      { keyVar: stmt.keyVar, valueVar: stmt.valueVar },
      () => this.emitStatementList(stmt.body, 0),
    );
    const bind = stmt.keyVar
      ? `foreach (${iterablePath} as ${stmt.keyVar} => ${stmt.valueVar}) {`
      : `foreach (${iterablePath} as ${stmt.valueVar}) {`;
    return [line(depth, bind), ...shiftLines(1, body), line(depth, '}')];
  }
}

function phpStringLiteral(key: string | number): string {
  if (typeof key === 'number') {
    return String(key);
  }
  return `'${String(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function emitCheckerIR(
  program: CheckerProgram,
  input?: EmitCheckerIRInput,
): PhpLine[] {
  return new CheckerIREmitter(
    program.parameter,
    input?.prioritizeReadabilityOverCompactness === true,
  ).emit(program);
}
