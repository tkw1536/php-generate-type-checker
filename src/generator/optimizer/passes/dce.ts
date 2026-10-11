import type { Arg, Block, Expr, Stmt, ValueRef } from '../../ir/types.ts';
import { binExpr, literalArg, refArg } from '../../ir/index.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPass } from '../pass.ts';

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

/**
 * IR foreach is only over arrays. A body that is solely `return E` where `E`
 * ignores the loop binders is equivalent to `if ($iter !== []) return E`
 * (empty: skip; non-empty: return on first iteration without using the element).
 */
function foreachConstantReturn(stmt: Extract<Stmt, { kind: 'foreach' }>, body: Block): Stmt | null {
  if (body.length !== 1 || body[0].kind !== 'return') {
    return null;
  }
  const ret = body[0];
  if (exprUsesVar(ret.expr, stmt.valueVar)) {
    return null;
  }
  if (stmt.keyVar !== null && exprUsesVar(ret.expr, stmt.keyVar)) {
    return null;
  }
  return {
    kind: 'if',
    cond: binExpr('!==', refArg(stmt.iterable), literalArg('[]')),
    body: [ret],
  };
}

function dceForeach(
  stmt: Extract<Stmt, { kind: 'foreach' }>,
  ctx?: Readonly<OptimizeContext>,
): Stmt | null {
  const body = dce(stmt.body, ctx);
  const withBody = { ...stmt, body };
  if (body.length === 0) {
    // Record against the post-DCE foreach (empty body). The pre-DCE stmt may
    // no longer appear in the live IR after nested dropFalse/etc.
    ctx?.trace.recordBlock('dce.dropEmptyForeach', [withBody], []);
    return null;
  }
  const constantReturn = foreachConstantReturn(stmt, body);
  if (constantReturn !== null) {
    ctx?.trace.recordBlock(
      'dce.foldForeach',
      [withBody],
      [constantReturn],
    );
    return constantReturn;
  }
  const keyVar =
    stmt.keyVar !== null && blockUsesVar(body, stmt.keyVar)
      ? stmt.keyVar
      : null;
  if (stmt.keyVar !== null && keyVar === null) {
    ctx?.trace.recordBlock(
      'dce.dropUnusedKey',
      [withBody],
      [{ ...stmt, keyVar: null, body }],
    );
  }
  return { ...stmt, keyVar, body };
}

function dceIf(
  stmt: Extract<Stmt, { kind: 'if' }>,
  prefix: Block,
  ctx?: Readonly<OptimizeContext>,
): { readonly append: Block; readonly reachable: boolean } {
  if (isBoolLit(stmt.cond, false)) {
    ctx?.trace.recordBlock('dce.dropFalse', [...prefix, stmt], prefix);
    return { append: [], reachable: true };
  }
  if (isBoolLit(stmt.cond, true)) {
    const inlined = dce(stmt.body, ctx);
    ctx?.trace.recordBlock(
      'dce.spliceTrue',
      [...prefix, stmt],
      [...prefix, ...inlined],
    );
    return { append: inlined, reachable: blockMayFallThrough(inlined) };
  }
  return {
    append: [
      {
        kind: 'if',
        cond: stmt.cond,
        body: dce(stmt.body, ctx),
      },
    ],
    reachable: true,
  };
}

export function dce(block: Block, ctx?: Readonly<OptimizeContext>): Block {
  const out: Stmt[] = [];
  let reachable = true;

  for (const stmt of block) {
    if (!reachable) {
      ctx?.trace.recordBlock('dce.dropUnreachable', [...out, stmt], [...out]);
      continue;
    }

    switch (stmt.kind) {
      case 'if': {
        const next = dceIf(stmt, out, ctx);
        out.push(...next.append);
        reachable = next.reachable;
        break;
      }
      case 'foreach': {
        const next = dceForeach(stmt, ctx);
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

export const dcePass: BlockPass = {
  id: 'dce',
  run(block, ctx) {
    return dce(block, ctx);
  },
};
