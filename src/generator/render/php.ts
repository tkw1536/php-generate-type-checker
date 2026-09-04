/**
 * Pure IR → PHP rendering. No output mode (function vs static).
 */
import type { Arg, Block, CheckerProgram, Expr, Stmt } from '../ir/types.ts';
import { renderValueRef } from './refs.ts';
import { type PhpLine, formatBody, ifBlock, line, shiftLines } from './context.ts';

export type RenderPhpOptions = {
  /** When true, `call_checker` prints as `self::Name(...)`. */
  useSelfCalls?: boolean;
};

/** PHP scalar keywords in generated checker output. */
export function renderPhpScalarLiteral(value: string): string {
  switch (value) {
    case 'true':
      return 'TRUE';
    case 'false':
      return 'FALSE';
    case 'null':
      return 'NULL';
    default:
      return value;
  }
}

function isLeaf(expr: Expr): boolean {
  switch (expr.kind) {
    case 'bool':
    case 'call':
    case 'bin':
    case 'instanceof':
    case 'call_checker':
      return true;
    case 'not':
      return isLeaf(expr.expr);
    case 'and':
    case 'or':
      return false;
    default:
      return true;
  }
}

function preferMultiline(expr: Expr): boolean {
  switch (expr.kind) {
    case 'and':
    case 'or':
      return (
        expr.exprs.length > 1 && expr.exprs.some((e) => !isLeaf(e))
      );
    case 'not':
      return preferMultiline(expr.expr);
    default:
      return false;
  }
}

function appendTrailingOperator(lines: PhpLine[], suffix: string): void {
  if (lines.length === 0) {
    return;
  }
  const last = lines[lines.length - 1];
  lines[lines.length - 1] = { depth: last.depth, text: last.text + suffix };
}

function renderOperand(expr: Expr, opts: RenderPhpOptions): string {
  const text = renderExpr(expr, opts);
  return isLeaf(expr) ? text : `(${text})`;
}

function renderArg(arg: Arg): string {
  switch (arg.kind) {
    case 'ref':
      return renderValueRef(arg.ref);
    case 'literal':
      return renderPhpScalarLiteral(arg.value);
    case 'call': {
      if (arg.name === '' && arg.args.length === 1) {
        return renderArg(arg.args[0]);
      }
      const args = arg.args.map((a) => renderArg(a)).join(', ');
      return `${arg.name}(${args})`;
    }
    default:
      return '';
  }
}

export function renderExpr(expr: Expr, opts: RenderPhpOptions = {}): string {
  switch (expr.kind) {
    case 'bool':
      return expr.value ? 'TRUE' : 'FALSE';
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
      if (child.kind === 'bin' || !isLeaf(child)) {
        return `!(${inner})`;
      }
      return `!${inner}`;
    }
    case 'and':
      return expr.exprs.map((e) => renderOperand(e, opts)).join(' && ');
    case 'or':
      return expr.exprs.map((e) => renderOperand(e, opts)).join(' || ');
    case 'call': {
      if (expr.name === '' && expr.args.length === 1) {
        return renderArg(expr.args[0]);
      }
      const args = expr.args.map((a) => renderArg(a)).join(', ');
      return `${expr.name}(${args})`;
    }
    case 'bin':
      return `${renderArg(expr.left)} ${expr.op} ${renderArg(expr.right)}`;
    case 'instanceof':
      return `${renderArg(expr.subject)} instanceof ${expr.className}`;
    case 'call_checker': {
      const path = renderValueRef(expr.subject);
      const name = opts.useSelfCalls ? `self::${expr.name}` : expr.name;
      return `${name}(${path})`;
    }
    default:
      return 'FALSE';
  }
}

/** Operand of a multiline &&/|| chain; nested compounds get their own `( … )`. */
function renderCompoundOperandLines(
  expr: Expr,
  depth: number,
  opts: RenderPhpOptions,
): PhpLine[] {
  if (isLeaf(expr)) {
    return [line(depth, renderExpr(expr, opts))];
  }
  const inner = renderExprLayout(expr, depth, opts, true);
  if (inner.length === 1) {
    return [line(depth, `(${inner[0].text})`)];
  }
  return [
    line(depth, '('),
    ...shiftLines(1, inner),
    line(depth, ')'),
  ];
}

function renderJunctionLines(
  expr: Extract<Expr, { kind: 'and' }> | Extract<Expr, { kind: 'or' }>,
  depth: number,
  opts: RenderPhpOptions,
  groupParens: boolean,
): PhpLine[] {
  const suffix = expr.kind === 'and' ? ' &&' : ' ||';
  const lines: PhpLine[] = groupParens ? [line(depth, '(')] : [];
  const partDepth = groupParens ? depth + 1 : depth;

  for (let i = 0; i < expr.exprs.length; i++) {
    if (i > 0) {
      appendTrailingOperator(lines, suffix);
    }
    const e = expr.exprs[i];
    if (isLeaf(e)) {
      lines.push(line(partDepth, renderExpr(e, opts)));
    } else {
      lines.push(...renderCompoundOperandLines(e, partDepth, opts));
    }
  }

  if (groupParens) {
    lines.push(line(depth, ')'));
  }
  return lines;
}

/**
 * @param groupParens Extra `( … )` around a compound &&/|| (omit inside `if (` or `!(`).
 */
function renderExprLayout(
  expr: Expr,
  depth: number,
  opts: RenderPhpOptions,
  groupParens = true,
): PhpLine[] {
  switch (expr.kind) {
    case 'bool':
    case 'call':
    case 'bin':
    case 'instanceof':
    case 'call_checker':
      return [line(depth, renderExpr(expr, opts))];
    case 'not': {
      if (!preferMultiline(expr.expr)) {
        return [line(depth, renderExpr(expr, opts))];
      }
      return [
        line(depth, '!('),
        ...renderExprLayout(expr.expr, depth + 1, opts, false),
        line(depth, ')'),
      ];
    }
    case 'and':
    case 'or':
      if (expr.exprs.length === 1) {
        return renderExprLayout(expr.exprs[0], depth, opts, groupParens);
      }
      if (expr.exprs.every(isLeaf)) {
        return renderJunctionLines(expr, depth, opts, false);
      }
      return renderJunctionLines(expr, depth, opts, groupParens);
    default:
      return [line(depth, renderExpr(expr, opts))];
  }
}

function renderConditionBlock(
  expr: Expr,
  depth: number,
  opts: RenderPhpOptions,
  body: PhpLine[],
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
      const bind = stmt.keyVar
        ? `foreach (${iterable} as ${stmt.keyVar} => ${stmt.valueVar}) {`
        : `foreach (${iterable} as ${stmt.valueVar}) {`;
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
