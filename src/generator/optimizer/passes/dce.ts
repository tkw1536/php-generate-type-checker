import type { Arg, Block, Expr, Stmt, ValueRef } from '../../ir/types.ts';
import { binExpr, literalArg, refArg } from '../../ir/index.ts';
import type { OptimizeContext } from '../context.ts';
import type { BlockPass, BlockPassResult } from '../pass.ts';
import { commitReason, withScope } from '../trace/commit.ts';
import { blockStep } from '../trace/rewrite.ts';
import type { TracePos } from '../trace/types.ts';

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
function foreachConstantReturn(
  stmt: Extract<Stmt, { kind: 'foreach' }>,
  body: Block,
): Stmt | null {
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
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
): { readonly stmt: Stmt | null; readonly pos: TracePos } {
  const bodyResult = dce(stmt.body, ctx, withScope(pos, stmt.body));
  let currentPos = bodyResult.pos;
  const body = bodyResult.block;
  const withBody = { ...stmt, body };
  if (body.length === 0) {
    if (ctx !== undefined) {
      currentPos = commitReason(
        ctx,
        currentPos,
        blockStep('dce.dropEmptyForeach', [withBody], []),
      );
    }
    return { stmt: null, pos: currentPos };
  }
  const constantReturn = foreachConstantReturn(stmt, body);
  if (constantReturn !== null) {
    if (ctx !== undefined) {
      currentPos = commitReason(
        ctx,
        currentPos,
        blockStep('dce.foldForeach', [withBody], [constantReturn]),
      );
    }
    return { stmt: constantReturn, pos: currentPos };
  }
  const keyVar =
    stmt.keyVar !== null && blockUsesVar(body, stmt.keyVar)
      ? stmt.keyVar
      : null;
  if (stmt.keyVar !== null && keyVar === null) {
    const after = { ...stmt, keyVar: null, body };
    if (ctx !== undefined) {
      currentPos = commitReason(
        ctx,
        currentPos,
        blockStep('dce.dropUnusedKey', [withBody], [after]),
      );
    }
    return { stmt: after, pos: currentPos };
  }
  return { stmt: { ...stmt, keyVar, body }, pos: currentPos };
}

function dceIf(
  stmt: Extract<Stmt, { kind: 'if' }>,
  prefix: Block,
  ctx: Readonly<OptimizeContext> | undefined,
  pos: TracePos,
): {
  readonly append: Block;
  readonly reachable: boolean;
  readonly pos: TracePos;
} {
  if (isBoolLit(stmt.cond, false)) {
    let currentPos = pos;
    if (ctx !== undefined) {
      currentPos = commitReason(
        ctx,
        pos,
        blockStep('dce.dropFalse', [...prefix, stmt], prefix),
      );
    }
    return { append: [], reachable: true, pos: currentPos };
  }
  if (isBoolLit(stmt.cond, true)) {
    const inlined = dce(stmt.body, ctx, withScope(pos, stmt.body));
    let currentPos = inlined.pos;
    if (ctx !== undefined) {
      currentPos = commitReason(
        ctx,
        currentPos,
        blockStep(
          'dce.spliceTrue',
          [...prefix, stmt],
          [...prefix, ...inlined.block],
        ),
      );
    }
    return {
      append: inlined.block,
      reachable: blockMayFallThrough(inlined.block),
      pos: currentPos,
    };
  }
  const body = dce(stmt.body, ctx, withScope(pos, stmt.body));
  return {
    append: [{ kind: 'if', cond: stmt.cond, body: body.block }],
    reachable: true,
    pos: body.pos,
  };
}

export function dce(
  block: Block,
  ctx?: Readonly<OptimizeContext>,
  pos?: TracePos,
): BlockPassResult {
  let currentPos = pos ?? { checker: block, scope: block };
  const out: Stmt[] = [];
  let reachable = true;

  for (const stmt of block) {
    if (!reachable) {
      if (ctx !== undefined) {
        currentPos = commitReason(
          ctx,
          currentPos,
          blockStep('dce.dropUnreachable', [...out, stmt], [...out]),
        );
      }
      continue;
    }

    switch (stmt.kind) {
      case 'if': {
        const next = dceIf(stmt, out, ctx, currentPos);
        out.push(...next.append);
        reachable = next.reachable;
        currentPos = next.pos;
        break;
      }
      case 'foreach': {
        const next = dceForeach(stmt, ctx, currentPos);
        currentPos = next.pos;
        if (next.stmt !== null) {
          out.push(next.stmt);
        }
        break;
      }
      case 'return':
        out.push(stmt);
        reachable = false;
        break;
      default:
        throw new Error('never reached');
    }
  }

  return { block: out, pos: currentPos };
}

export const dcePass: BlockPass = {
  id: 'dce',
  run(block, ctx, pos) {
    return dce(block, ctx, pos);
  },
};
