import type { Block, CheckerIR, Expr } from '../../ir/types.ts';
import type {
  FactOriginId,
  FactReasonId,
} from '../passes/facts/env.types.ts';

/** IR fragment for focus/scope/checker views — no render-time temp names. */
export type OptimizeTraceSnapshot =
  | { readonly kind: 'block'; readonly block: Block }
  | { readonly kind: 'expr'; readonly expr: Expr }
  | { readonly kind: 'ir'; readonly ir: CheckerIR };

export type TraceScopeSnapshot =
  | { readonly kind: 'block'; readonly block: Block }
  | { readonly kind: 'ir'; readonly ir: CheckerIR };

export type OptimizeTraceRuleId =
  | 'trace.initial'
  | 'dedupe.drop'
  | 'unnest.collapse'
  | 'combine.merge'
  | 'flatten.fold'
  | 'inline.substitute'
  | 'inline.negate'
  | 'facts.env.extend'
  | 'facts.env.assumed'
  | 'facts.env.andSplit'
  | 'facts.env.orSplit'
  | 'facts.env.notFlip'
  | 'facts.env.commute'
  | 'facts.env.deMorgan'
  | 'facts.env.exclusive'
  | 'facts.env.equalityType'
  | 'facts.env.instanceofObject'
  | 'facts.env.isAClassExists'
  | 'facts.proveTrue'
  | 'facts.proveFalse'
  | 'facts.prove.equals'
  | 'facts.prove.entails'
  | 'facts.imply.refl'
  | 'facts.imply.exclusive'
  | 'facts.imply.instanceofObject'
  | 'facts.imply.isAClassExists'
  | 'facts.imply.emptyArrayCount'
  | 'facts.imply.arrayKeyExistsNonEmpty'
  | 'facts.imply.arrayKeyExistsCountNonZero'
  | 'facts.imply.countPositiveNonEmpty'
  | 'facts.imply.notKey0NotListOrEmpty'
  | 'facts.imply.listHigherKeyExists'
  | 'facts.imply.equalityType'
  | 'facts.imply.andConjunct'
  | 'facts.imply.orDisjunct'
  | 'facts.imply.canon'
  | 'facts.absorb'
  | 'facts.absorb.implies'
  | 'facts.normalize.countEmpty'
  | 'facts.normalize.listCountKeyExists'
  | 'facts.normalize.listNonEmptyKey0'
  | 'simplify.expand'
  | 'simplify.absorb'
  | 'simplify.normalize'
  | 'simplify.normalize.boolFold'
  | 'simplify.normalize.identity'
  | 'simplify.normalize.doubleNeg'
  | 'simplify.normalize.deMorgan'
  | 'simplify.normalize.factor'
  | 'simplify.normalize.absorb'
  | 'simplify.normalize.contradiction'
  | 'simplify.normalize.dedupe'
  | 'simplify.normalize.reorder'
  | 'dce.dropFalse'
  | 'dce.spliceTrue'
  | 'dce.dropEmptyForeach'
  | 'dce.foldForeach'
  | 'dce.dropUnusedKey'
  | 'dce.dropUnreachable'
  | 'prune.remove';

/** A fact from the env used to justify a rewrite, with its known polarity. */
export type OptimizeTraceFactUse = {
  readonly expr: Expr;
  readonly known: 'true' | 'false';
  readonly origin: FactOriginId;
  /** How the fact entered the env (assumed, exclusive derivation, …). */
  readonly reason: FactReasonId;
};

export type TraceEvidence =
  | { readonly kind: 'facts'; readonly used: readonly OptimizeTraceFactUse[] }
  | { readonly kind: 'inline'; readonly callee: string }
  | { readonly kind: 'prune'; readonly removed: string };

/**
 * Why a rewrite happened. `none` = unchanged; `step` = one rewrite (optional
 * nested children); `seq` = ordered rewrites that each advance the checker.
 */
export type TraceReasoning =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'step';
      readonly rule: OptimizeTraceRuleId;
      readonly focus: {
        readonly before: OptimizeTraceSnapshot;
        readonly after: OptimizeTraceSnapshot;
      };
      readonly children: readonly TraceReasoning[];
      readonly evidence?: TraceEvidence;
    }
  | { readonly kind: 'seq'; readonly parts: readonly TraceReasoning[] };

export type TraceStepReason = Extract<TraceReasoning, { kind: 'step' }>;

/** Immutable position while rewriting one checker. */
export type TracePos = {
  readonly checker: Block;
  readonly scope: Block;
};

/** Bookkeeping stamped onto top-level steps (not IR). */
export type TraceMeta = {
  readonly program: string;
  readonly outerLoop: number;
  readonly blockLoop: number;
};

/** Top-level checker-advancing step (UI Trace list root rows). */
export type TraceStep = {
  readonly index: number;
  readonly program: string;
  readonly outerLoop: number;
  readonly blockLoop: number;
  readonly scope: {
    readonly before: TraceScopeSnapshot;
    readonly after: TraceScopeSnapshot;
  };
  readonly checker: {
    readonly before: TraceScopeSnapshot;
    readonly after: TraceScopeSnapshot;
  };
  readonly reason: TraceStepReason;
};

/** Expr rewrite: always value + reason (never a bare Expr from a rewriter). */
export type ExprRewrite = {
  readonly expr: Expr;
  readonly reason: TraceReasoning;
};
