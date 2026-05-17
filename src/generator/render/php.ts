/**
 * Pure IR → PHP rendering. No output mode (function vs static).
 */
import type { Arg, Block, CheckerProgram, Expr, Stmt } from '../ir/types.ts';
import { renderValueRef } from './refs.ts';
import {
  type PhpLine,
  formatBody,
  ifBlock,
  ifBlockMultilineOr,
  line,
  returnMultilineAnd,
  shiftLines,
} from './context.ts';

export type RenderPhpOptions = {
  /** When true, `call_checker` prints as `self::Name(...)`. */
  useSelfCalls?: boolean;
};

const PREC = {
  or: 1,
  and: 2,
  not: 3,
  atom: 4,
} as const;

function prec(expr: Expr): number {
  switch (expr.kind) {
    case 'or':
      return PREC.or;
    case 'and':
      return PREC.and;
    case 'not':
      return PREC.not;
    default:
      return PREC.atom;
  }
}

function wrap(expr: string, parentPrec: number, child: Expr): string {
  return prec(child) < parentPrec ? `(${expr})` : expr;
}

function renderArg(arg: Arg, opts: RenderPhpOptions): string {
  switch (arg.kind) {
    case 'ref':
      return renderValueRef(arg.ref);
    case 'literal':
      return arg.value;
    case 'call': {
      if (arg.name === '' && arg.args.length === 1) {
        return renderArg(arg.args[0]!, opts);
      }
      const args = arg.args.map((a) => renderArg(a, opts)).join(', ');
      return `${arg.name}(${args})`;
    }
    default:
      return '';
  }
}

export function renderExpr(expr: Expr, opts: RenderPhpOptions = {}): string {
  switch (expr.kind) {
    case 'bool':
      return expr.value ? 'true' : 'false';
    case 'not': {
      const child = expr.expr;
      if (
        child.kind === 'bin' &&
        child.op === '!==' &&
        child.right.kind === 'literal' &&
        child.right.value === '[]'
      ) {
        return renderExpr(
          { kind: 'bin', op: '===', left: child.left, right: child.right },
          opts,
        );
      }
      const inner = renderExpr(child, opts);
      if (child.kind === 'bin' || child.kind === 'and' || child.kind === 'or') {
        return `!(${inner})`;
      }
      return `!${wrap(inner, PREC.not, child)}`;
    }
    case 'and': {
      const parts = expr.exprs.map((e) =>
        wrap(renderExpr(e, opts), PREC.and, e),
      );
      return parts.join(' && ');
    }
    case 'or': {
      const parts = expr.exprs.map((e) =>
        wrap(renderExpr(e, opts), PREC.or, e),
      );
      return parts.join(' || ');
    }
    case 'call': {
      if (expr.name === '' && expr.args.length === 1) {
        return renderArg(expr.args[0]!, opts);
      }
      const args = expr.args.map((a) => renderArg(a, opts)).join(', ');
      return `${expr.name}(${args})`;
    }
    case 'bin':
      return `${renderArg(expr.left, opts)} ${expr.op} ${renderArg(expr.right, opts)}`;
    case 'instanceof':
      return `${renderArg(expr.subject, opts)} instanceof ${expr.className}`;
    case 'call_checker': {
      const path = renderValueRef(expr.subject);
      const name = opts.useSelfCalls ? `self::${expr.name}` : expr.name;
      return `${name}(${path})`;
    }
    default:
      return 'false';
  }
}

function renderReturnExpr(expr: Expr, opts: RenderPhpOptions): string {
  if (expr.kind === 'or' && expr.exprs.length > 1) {
    const parts = expr.exprs.map((e) =>
      e.kind === 'and' && e.exprs.length > 1
        ? `(${renderExpr(e, opts)})`
        : renderExpr(e, opts),
    );
    const inner = parts.join(' || ');
    const wrapWhole = !expr.exprs.every((e) => e.kind === 'call_checker');
    return wrapWhole ? `(${inner})` : inner;
  }
  if (expr.kind === 'and' && expr.exprs.length === 2) {
    return `(${renderExpr(expr, opts)})`;
  }
  return renderExpr(expr, opts);
}

function renderIfStmt(
  stmt: Extract<Stmt, { kind: 'if' }>,
  depth: number,
  opts: RenderPhpOptions,
): PhpLine[] {
  const body = renderBlock(stmt.body, 0, opts);
  if (stmt.cond.kind === 'or' && stmt.cond.exprs.length > 1) {
    const parts = stmt.cond.exprs.map((e) => renderExpr(e, opts));
    return ifBlockMultilineOr(depth, parts, body);
  }
  return ifBlock(depth, renderExpr(stmt.cond, opts), body);
}

export function renderBlock(block: Block, depth: number, opts: RenderPhpOptions): PhpLine[] {
  const out: PhpLine[] = [];
  for (const stmt of block) {
    out.push(...renderStmt(stmt, depth, opts));
  }
  return out;
}

function renderStmt(stmt: Stmt, depth: number, opts: RenderPhpOptions): PhpLine[] {
  switch (stmt.kind) {
    case 'if':
      return renderIfStmt(stmt, depth, opts);
    case 'foreach': {
      const iterable = renderValueRef(stmt.iterable);
      const bind = stmt.keyVar
        ? `foreach (${iterable} as ${stmt.keyVar} => ${stmt.valueVar}) {`
        : `foreach (${iterable} as ${stmt.valueVar}) {`;
      const body = renderBlock(stmt.body, 0, opts);
      return [line(depth, bind), ...shiftLines(1, body), line(depth, '}')];
    }
    case 'return': {
      if (stmt.expr.kind === 'and' && stmt.expr.exprs.length > 1) {
        const parts = stmt.expr.exprs.map((e) => renderExpr(e, opts));
        const joined = parts.join(' && ');
        const useMultiline = joined.length > 72;
        if (useMultiline) {
          return returnMultilineAnd(depth, parts);
        }
        const expr =
          stmt.expr.exprs.length === 2 ? `(${joined})` : joined;
        return [line(depth, `return ${expr};`)];
      }
      return [line(depth, `return ${renderReturnExpr(stmt.expr, opts)};`)];
    }
    default:
      return [];
  }
}

export function renderProgramBody(
  program: CheckerProgram,
  opts: RenderPhpOptions = {},
): string {
  return formatBody(renderBlock(program.body, 0, opts));
}

export function renderProgram(
  program: CheckerProgram,
  opts: RenderPhpOptions = {},
): PhpLine[] {
  return renderBlock(program.body, 0, opts);
}
