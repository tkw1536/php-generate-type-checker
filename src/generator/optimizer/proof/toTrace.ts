import type { Expr } from '../../ir/types.ts';
import { boolLit } from '../../ir/index.ts';
import type {
  EnvAddEvent,
  EnvFact,
  EnvHow,
  FactEntry,
  FactReasonId,
} from '../passes/facts/env.types.ts';
import { exprStep } from '../trace/rewrite.ts';
import type {
  OptimizeTraceRuleId,
  TraceEvidence,
  TraceReasoning,
  TraceStepReason,
} from '../trace/types.ts';
import type { TheoryRuleId } from '../theory/types.ts';
import type {
  AbsorbDropProof,
  EntailProof,
  ImplyProof,
  ProveProof,
} from './types.ts';

function envRule(reason: FactReasonId): OptimizeTraceRuleId {
  switch (reason) {
    case 'assumed':
      return 'facts.env.assumed';
    case 'andSplit':
      return 'facts.env.andSplit';
    case 'orSplit':
      return 'facts.env.orSplit';
    case 'notFlip':
      return 'facts.env.notFlip';
    case 'commute':
      return 'facts.env.commute';
    case 'deMorgan':
      return 'facts.env.deMorgan';
    case 'exclusive':
      return 'facts.env.exclusive';
    case 'equalityType':
      return 'facts.env.equalityType';
    case 'instanceofObject':
      return 'facts.env.instanceofObject';
    case 'isAClassExists':
      return 'facts.env.isAClassExists';
    default:
      throw new Error('never reached');
  }
}

function theoryImplyRule(ruleId: TheoryRuleId): OptimizeTraceRuleId {
  // TheoryRuleId suffixes are exactly the facts.imply.* leaf catalog entries.
  return `facts.imply.${ruleId}` as OptimizeTraceRuleId;
}

function structuralImplyRule(
  kind: 'refl' | 'andConjunct' | 'orDisjunct' | 'canon',
): OptimizeTraceRuleId {
  switch (kind) {
    case 'refl':
      return 'facts.imply.refl';
    case 'andConjunct':
      return 'facts.imply.andConjunct';
    case 'orDisjunct':
      return 'facts.imply.orDisjunct';
    case 'canon':
      return 'facts.imply.canon';
    default:
      throw new Error('never reached');
  }
}

function howChildren(how: EnvHow): readonly TraceReasoning[] {
  if (how.kind === 'assumed') {
    return [];
  }
  return how.premises.map((p) => envFactStep(p));
}

function envFactEvidence(
  entry: FactEntry,
  known: 'true' | 'false',
): TraceEvidence {
  return {
    kind: 'facts',
    used: [
      {
        expr: entry.expr,
        known,
        origin: entry.origin,
        reason: entry.reason,
      },
    ],
  };
}

function envFactStep(fact: EnvFact): TraceStepReason {
  const reason: FactReasonId =
    fact.how.kind === 'assumed' ? 'assumed' : fact.how.rule;
  const after =
    fact.known === 'true' ? fact.expr : { kind: 'not' as const, expr: fact.expr };
  const entry: FactEntry = {
    expr: fact.expr,
    origin: fact.origin,
    reason,
    how: fact.how,
  };
  return exprStep(
    envRule(reason),
    fact.expr,
    after,
    howChildren(fact.how),
    envFactEvidence(entry, fact.known),
  );
}

/** Micro-steps for a flushed env batch. */
export function envEventsToChildren(
  events: readonly EnvAddEvent[],
): readonly TraceStepReason[] {
  return events.map((e) => {
    const after =
      e.known === 'true'
        ? e.entry.expr
        : { kind: 'not' as const, expr: e.entry.expr };
    const premiseFocus =
      e.from === null
        ? e.entry.expr
        : e.from.expr;
    return exprStep(
      envRule(e.entry.reason),
      premiseFocus,
      after,
      howChildren(e.entry.how),
      envFactEvidence(e.entry, e.known),
    );
  });
}

export function implyProofToChildren(
  from: Expr,
  to: Expr,
  proof: ImplyProof,
): TraceStepReason {
  switch (proof.kind) {
    case 'refl':
      return exprStep(structuralImplyRule('refl'), from, to, []);
    case 'rule': {
      const rule = theoryImplyRule(proof.ruleId);
      if (proof.via === undefined) {
        return exprStep(rule, from, to, []);
      }
      return exprStep(rule, from, to, [
        implyProofToChildren(from, to, proof.via),
      ]);
    }
    case 'andConjunct':
      return exprStep(structuralImplyRule('andConjunct'), from, to, [
        implyProofToChildren(proof.conjunct, to, proof.via),
      ]);
    case 'orDisjunct':
      return exprStep(structuralImplyRule('orDisjunct'), from, to, [
        implyProofToChildren(from, proof.disjunct, proof.via),
      ]);
    case 'canon':
      return exprStep(structuralImplyRule('canon'), proof.before, proof.after, [
        implyProofToChildren(proof.after, to, proof.via),
      ]);
    default:
      throw new Error('never reached');
  }
}

function entailProofToChildren(
  premise: Expr,
  conclusion: Expr,
  proof: EntailProof,
): TraceStepReason {
  switch (proof.kind) {
    case 'byImplies':
      return implyProofToChildren(premise, conclusion, proof.imply);
    case 'orCases':
      return exprStep(
        'facts.prove.entails',
        premise,
        conclusion,
        proof.cases.map((c, i) => {
          if (premise.kind !== 'or') {
            throw new Error('never reached');
          }
          return entailProofToChildren(premise.exprs[i], conclusion, c);
        }),
      );
    case 'andPick':
      return exprStep('facts.prove.entails', premise, conclusion, [
        entailProofToChildren(proof.conjunct, conclusion, proof.via),
      ]);
    default:
      throw new Error('never reached');
  }
}

function envHowToChildren(fact: EnvFact): readonly TraceReasoning[] {
  return [envFactStep(fact)];
}

/** Nested proof under facts.proveTrue / proveFalse. */
export function proveProofToChildren(
  before: Expr,
  after: Expr,
  proof: ProveProof,
): readonly TraceReasoning[] {
  const kids: TraceReasoning[] = [...envHowToChildren(proof.fact)];
  if (proof.canon !== undefined) {
    kids.push(
      exprStep(
        'facts.imply.canon',
        proof.canon.from,
        proof.canon.to,
        [],
      ),
    );
  }
  if (proof.kind === 'equals') {
    kids.push(exprStep('facts.prove.equals', proof.conclusion, after, []));
  } else {
    kids.push(
      entailProofToChildren(
        proof.fact.expr,
        proof.conclusion,
        proof.bridge,
      ),
      exprStep('facts.prove.entails', before, after, []),
    );
  }
  return kids;
}

export function absorbDropToChildren(
  drop: AbsorbDropProof,
): TraceStepReason {
  if (drop.how.kind === 'structural') {
    return exprStep('facts.absorb.implies', drop.from, drop.to, [
      implyProofToChildren(drop.from, drop.to, drop.how.imply),
    ]);
  }
  return exprStep('facts.absorb.implies', drop.from, drop.to, [
    ...proveProofToChildren(
      drop.from,
      boolLit(true),
      drop.how.prove,
    ),
  ]);
}
