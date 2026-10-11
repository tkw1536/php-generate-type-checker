import type { Block, Expr } from '../../ir/types.ts';
import { equals } from '../../ir/equals.ts';
import type {
  BlockRewrite,
  ExprRewrite,
  OptimizeTraceRuleId,
  OptimizeTraceSnapshot,
  TraceEvidence,
  TraceReasoning,
  TraceStepReason,
} from './types.ts';

export function unchangedExpr(expr: Expr): ExprRewrite {
  return { expr, reason: { kind: 'none' } };
}

export function unchangedBlock(block: Block): BlockRewrite {
  return { block, reason: { kind: 'none' } };
}

export function exprFocus(
  before: Expr,
  after: Expr,
): {
  readonly before: OptimizeTraceSnapshot;
  readonly after: OptimizeTraceSnapshot;
} {
  return {
    before: { kind: 'expr', expr: before },
    after: { kind: 'expr', expr: after },
  };
}

export function blockFocus(
  before: Block,
  after: Block,
): {
  readonly before: OptimizeTraceSnapshot;
  readonly after: OptimizeTraceSnapshot;
} {
  return {
    before: { kind: 'block', block: before },
    after: { kind: 'block', block: after },
  };
}

export function exprStep(
  rule: OptimizeTraceRuleId,
  before: Expr,
  after: Expr,
  children: readonly TraceReasoning[] = [],
  evidence?: TraceEvidence,
): TraceStepReason {
  return {
    kind: 'step',
    rule,
    focus: exprFocus(before, after),
    children,
    evidence,
  };
}

export function blockStep(
  rule: OptimizeTraceRuleId,
  before: Block,
  after: Block,
  children: readonly TraceReasoning[] = [],
  evidence?: TraceEvidence,
): TraceStepReason {
  return {
    kind: 'step',
    rule,
    focus: blockFocus(before, after),
    children,
    evidence,
  };
}

export function exprRewrite(
  rule: OptimizeTraceRuleId,
  before: Expr,
  after: Expr,
  children: readonly TraceReasoning[] = [],
  evidence?: TraceEvidence,
): ExprRewrite {
  if (equals(before, after)) {
    return unchangedExpr(before);
  }
  return {
    expr: after,
    reason: exprStep(rule, before, after, children, evidence),
  };
}

export function blockRewrite(
  rule: OptimizeTraceRuleId,
  before: Block,
  after: Block,
  children: readonly TraceReasoning[] = [],
  evidence?: TraceEvidence,
): BlockRewrite {
  return {
    block: after,
    reason: blockStep(rule, before, after, children, evidence),
  };
}

/** Flatten seq/none; keep step nodes (with their children). */
export function flattenReasons(
  reason: TraceReasoning,
): readonly TraceStepReason[] {
  switch (reason.kind) {
    case 'none':
      return [];
    case 'step':
      return [reason];
    case 'seq': {
      const out: TraceStepReason[] = [];
      for (const part of reason.parts) {
        out.push(...flattenReasons(part));
      }
      return out;
    }
    default:
      throw new Error('never reached');
  }
}

export function seqReason(
  parts: readonly TraceReasoning[],
): TraceReasoning {
  const flat = parts.flatMap((p) => flattenReasons(p));
  if (flat.length === 0) {
    return { kind: 'none' };
  }
  if (flat.length === 1) {
    return flat[0];
  }
  return { kind: 'seq', parts: flat };
}

export function mergeExprRewrites(
  expr: Expr,
  parts: readonly ExprRewrite[],
): ExprRewrite {
  return {
    expr,
    reason: seqReason(parts.map((p) => p.reason)),
  };
}
