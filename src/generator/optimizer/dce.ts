import type { Arg, Block, Expr, Stmt, ValueRef } from '../ir/types.ts';

function isBoolLit(expr: Expr, value: boolean): boolean {
  return expr.kind === 'bool' && expr.value === value;
}

function blockMayFallThrough(block: Block): boolean {
  if (block.length === 0) {
    return true;
  }
  const last = block.at(-1);
  return last !== undefined && last.kind !== 'return';
}

function valueRefUsesVar(ref: ValueRef, id: number): boolean {
  switch (ref.kind) {
    case 'parameter':
      return false;
    case 'variable':
      return ref.id === id;
    case 'array_access':
      return valueRefUsesVar(ref.object, id);
    case 'property_access':
      return valueRefUsesVar(ref.object, id);
    default:
      throw new Error('never reached');
  }
}

function argUsesVar(arg: Arg, id: number): boolean {
  switch (arg.kind) {
    case 'ref':
      return valueRefUsesVar(arg.ref, id);
    case 'literal':
      return false;
    case 'call':
      return arg.args.some((a) => argUsesVar(a, id));
    default:
      throw new Error('never reached');
  }
}

function exprUsesVar(expr: Expr, id: number): boolean {
  switch (expr.kind) {
    case 'bool':
      return false;
    case 'not':
      return exprUsesVar(expr.expr, id);
    case 'and':
    case 'or':
      return expr.exprs.some((e) => exprUsesVar(e, id));
    case 'call':
      return expr.args.some((a) => argUsesVar(a, id));
    case 'bin':
      return argUsesVar(expr.left, id) || argUsesVar(expr.right, id);
    case 'instanceof':
      return argUsesVar(expr.subject, id);
    case 'call_checker':
      return valueRefUsesVar(expr.subject, id);
    default:
      throw new Error('never reached');
  }
}

function blockUsesVar(block: Block, id: number): boolean {
  for (const stmt of block) {
    switch (stmt.kind) {
      case 'if':
        if (exprUsesVar(stmt.cond, id) || blockUsesVar(stmt.body, id)) {
          return true;
        }
        break;
      case 'foreach':
        if (
          valueRefUsesVar(stmt.iterable, id) ||
          blockUsesVar(stmt.body, id)
        ) {
          return true;
        }
        break;
      case 'return':
        if (exprUsesVar(stmt.expr, id)) {
          return true;
        }
        break;
      default:
        throw new Error('never reached');
    }
  }
  return false;
}

function dceForeach(stmt: Extract<Stmt, { kind: 'foreach' }>): Stmt | null {
  const body = dce(stmt.body);
  if (body.length === 0) {
    return null;
  }
  const keyVar =
    stmt.keyVar !== null && blockUsesVar(body, stmt.keyVar)
      ? stmt.keyVar
      : null;
  return { ...stmt, keyVar, body };
}

export function dce(block: Block): Block {
  const out: Stmt[] = [];
  let reachable = true;

  for (const stmt of block) {
    if (!reachable) {
      continue;
    }

    switch (stmt.kind) {
      case 'if': {
        if (isBoolLit(stmt.cond, false)) {
          break;
        }
        if (isBoolLit(stmt.cond, true)) {
          const inlined = dce(stmt.body);
          out.push(...inlined);
          if (!blockMayFallThrough(inlined)) {
            reachable = false;
          }
          break;
        }
        out.push({
          kind: 'if',
          cond: stmt.cond,
          body: dce(stmt.body),
        });
        break;
      }
      case 'foreach': {
        const next = dceForeach(stmt);
        if (next !== null) {
          out.push(next);
        }
        break;
      }
      case 'return':
        out.push(stmt);
        reachable = false;
        break;
      default: {
        const exhaustive: never = stmt;
        out.push(exhaustive);
      }
    }
  }

  return out;
}
