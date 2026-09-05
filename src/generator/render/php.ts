/**
 * Pure IR → PHP rendering. No output mode (function vs static).
 */
import type { Block, CheckerProgram, Expr, Stmt } from '../ir/types.ts';
import { type PhpLine, formatBody, ifBlock, line, shiftLines } from './context.ts';
import {
  type RenderPhpOptions,
  isLeaf,
  preferMultiline,
  renderExpr,
  renderExprLayout,
  renderJunctionLines,
} from './phpExpr.ts';
import { renderValueRef } from './refs.ts';

function renderConditionBlock(
  expr: Expr,
  depth: number,
  opts: RenderPhpOptions,
  body: readonly PhpLine[],
): PhpLine[] {
  if (
    (expr.kind === 'and' || expr.kind === 'or') &&
    expr.exprs.length > 1 &&
    expr.exprs.every(isLeaf)
  ) {
    return [
      line(depth, 'if ('),
      ...renderJunctionLines(expr, depth + 1, opts, false),
      line(depth, ') {'),
      ...shiftLines(1, body),
      line(depth, '}'),
    ];
  }
  if (!preferMultiline(expr)) {
    return ifBlock(depth, renderExpr(expr, opts), body);
  }
  if (expr.kind === 'not' && preferMultiline(expr.expr)) {
    return [
      line(depth, 'if (!('),
      ...renderExprLayout(expr.expr, depth + 1, opts, false),
      line(depth, ') {'),
      ...shiftLines(1, body),
      line(depth, '}'),
    ];
  }
  return [
    line(depth, 'if ('),
    ...renderExprLayout(expr, depth + 1, opts, false),
    line(depth, ') {'),
    ...shiftLines(1, body),
    line(depth, '}'),
  ];
}

function renderReturnStmt(
  expr: Expr,
  depth: number,
  opts: RenderPhpOptions,
): PhpLine[] {
  if (!preferMultiline(expr)) {
    const text = renderExpr(expr, opts);
    if (
      (expr.kind === 'and' || expr.kind === 'or') &&
      expr.exprs.length > 1
    ) {
      return [line(depth, `return (${text});`)];
    }
    return [line(depth, `return ${text};`)];
  }
  if (expr.kind === 'not' && preferMultiline(expr.expr)) {
    return [
      line(depth, 'return !('),
      ...renderExprLayout(expr.expr, depth + 1, opts, false),
      line(depth, ');'),
    ];
  }
  return [
    line(depth, 'return ('),
    ...renderExprLayout(expr, depth + 1, opts, false),
    line(depth, ');'),
  ];
}

function renderIfStmt(
  stmt: Extract<Stmt, { kind: 'if' }>,
  depth: number,
  opts: RenderPhpOptions,
): PhpLine[] {
  const body = renderBlock(stmt.body, 0, opts);
  return renderConditionBlock(stmt.cond, depth, opts, body);
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
      const bind =
        stmt.keyVar === null
          ? `foreach (${iterable} as ${stmt.valueVar}) {`
          : `foreach (${iterable} as ${stmt.keyVar} => ${stmt.valueVar}) {`;
      const body = renderBlock(stmt.body, 0, opts);
      return [line(depth, bind), ...shiftLines(1, body), line(depth, '}')];
    }
    case 'return':
      return renderReturnStmt(stmt.expr, depth, opts);
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
