import type { Block, Stmt, ValueRef } from '../../../ir/types.ts';
import {
  callExpr,
  orExpr,
  refArg,
  variableRef,
} from '../../../ir/index.ts';
import { nonDecimalIntStringExpr } from '../../../decimalIntString.ts';
import type { OptimizeContext } from '../../context.ts';
import type { BlockPass } from '../../pass.ts';
import {
  type FactEnv,
  emptyFactEnv,
  withFalseFact,
  withTrueFact,
} from './env.ts';
import { substituteFacts } from './substitute.ts';

/**
 * True when an `if` body (linear IR, no else) always reaches `return` if entered:
 * the last statement must be `return`, so any `if`/`foreach` inside either
 * returns there or falls through to that trailing `return`.
 */
export function blockAlwaysExitsWhenEntered(block: Block): boolean {
  // Note: Checking only the last statement assumes DCE has run.
  // This may not be true this time, but will be eventually.
  const last = block.at(-1);
  return last !== undefined && last.kind === 'return';
}

export function applyKnownFacts(
  block: Block,
  env: FactEnv,
  ctx?: Readonly<OptimizeContext>,
): Block {
  ctx?.pushEnclosingBlock(block);
  try {
    const out: Stmt[] = [];
    let currentEnv = env;

    for (const stmt of block) {
      switch (stmt.kind) {
        case 'if': {
          const next = applyKnownFactsIf(stmt, currentEnv, ctx);
          out.push(next.stmt);
          currentEnv = next.env;
          break;
        }
        case 'foreach':
          out.push(applyKnownFactsForeach(stmt, currentEnv, ctx));
          break;
        case 'return':
          out.push({
            kind: 'return',
            expr: substituteFacts(stmt.expr, currentEnv, ctx),
          });
          syncFactsBlock(ctx, out);
          return out;
        default:
          throw new Error('never reached');
      }
    }

    syncFactsBlock(ctx, out);
    return out;
  } finally {
    ctx?.popEnclosingBlock();
  }
}

/** Keep the enclosing frame in sync with the rebuilt block for later traces. */
function syncFactsBlock(
  ctx: Readonly<OptimizeContext> | undefined,
  out: Block,
): void {
  ctx?.replaceTopEnclosingBlock(out);
}

function applyKnownFactsIf(
  stmt: Extract<Stmt, { kind: 'if' }>,
  env: FactEnv,
  ctx?: Readonly<OptimizeContext>,
): { stmt: Stmt; env: FactEnv } {
  const cond = substituteFacts(stmt.cond, env, ctx);
  const bodyEnv = withTrueFact(env, cond, 'ifTrue');
  const newBody = applyKnownFacts(stmt.body, bodyEnv, ctx);
  return {
    stmt: { kind: 'if', cond, body: newBody },
    env: blockAlwaysExitsWhenEntered(stmt.body)
      ? withFalseFact(env, cond, 'ifFalse')
      : env,
  };
}

/**
 * IR `foreach` is only emitted for arrays (parameterized `iterable` is rejected).
 * PHP array keys from foreach are always `int|non-decimal-int-string`.
 */
function seedForeachArrayKeyFacts(env: FactEnv, key: ValueRef): FactEnv {
  const s = refArg(key);
  const isInt = callExpr('is_int', [s]);
  const isString = callExpr('is_string', [s]);
  const nonDecimal = nonDecimalIntStringExpr(s);
  let next = env;
  for (const fact of [
    orExpr([isInt, isString]),
    orExpr([isString, isInt]),
    orExpr([isInt, nonDecimal]),
    orExpr([nonDecimal, isInt]),
  ]) {
    next = withTrueFact(next, fact, 'arrayKey');
  }
  return next;
}

function applyKnownFactsForeach(
  stmt: Extract<Stmt, { kind: 'foreach' }>,
  env: FactEnv,
  ctx?: Readonly<OptimizeContext>,
): Stmt {
  const bodyEnv =
    stmt.keyVar === null
      ? env
      : seedForeachArrayKeyFacts(env, variableRef(stmt.keyVar));
  return {
    ...stmt,
    body: applyKnownFacts(stmt.body, bodyEnv, ctx),
  };
}

export const factsPass: BlockPass = {
  id: 'facts',
  run(block, ctx) {
    return applyKnownFacts(block, emptyFactEnv(), ctx);
  },
};
