import type { Block, Expr, Stmt } from '../ir/types.ts';

function isBoolLit(expr: Expr, value: boolean): boolean {
  return expr.kind === 'bool' && expr.value === value;
}

function blockMayFallThrough(block: Block): boolean {
  if (block.length === 0) {
    return true;
  }
  return block[block.length - 1].kind !== 'return';
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
        const body = dce(stmt.body);
        if (body.length > 0) {
          out.push({ ...stmt, body });
        }
        break;
      }
      case 'return':
        out.push(stmt);
        reachable = false;
        break;
      default: {
        const _exhaustive: never = stmt;
        out.push(_exhaustive);
      }
    }
  }

  return out;
}
