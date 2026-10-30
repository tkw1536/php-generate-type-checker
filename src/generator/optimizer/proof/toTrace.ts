import type { Expr } from '../../ir/types.ts';
import { boolLit } from '../../ir/index.ts';
import type {
  EnvFact,
  EnvHow,
  FactEntry,
  FactOriginId,
} from '../passes/facts/env.types.ts';
import { entryReason } from '../passes/facts/env.types.ts';
import { exprStep } from '../trace/rewrite.ts';
import type {
  OptimizeTraceRuleId,
  TraceEvidence,
  TraceReasoning,
  TraceStepReason,
} from '../trace/types.ts';
import type {
  AbsorbDropProof,
  EntailProof,
  ImplyLeafId,
  ImplyProof,
  ProveProof,
} from './types.ts';

function assumedTrace(origin: FactOriginId): `facts.env.assumed.${FactOriginId}` {
  return `facts.env.assumed.${origin}`;
}

function implyTrace(leaf: ImplyLeafId): `facts.imply.${ImplyLeafId}` {
  return `facts.imply.${leaf}`;
}

function envFactRule(fact: EnvFact): OptimizeTraceRuleId {
  if (fact.how.kind === 'assumed') {
    return assumedTrace(fact.how.origin);
  }
  return `facts.env.${fact.how.rule}`;
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
        reason: entryReason(entry.how),
      },
    ],
  };
}

function envFactStep(fact: EnvFact): TraceStepReason {
  const after =
    fact.known === 'true' ? fact.expr : { kind: 'not' as const, expr: fact.expr };
  const entry: FactEntry = {
    expr: fact.expr,
    origin: fact.origin,
    how: fact.how,
  };
  return exprStep(
    envFactRule(fact),
    fact.expr,
    after,
    howChildren(fact.how),
    envFactEvidence(entry, fact.known),
  );
}

export function implyProofToChildren(
  from: Expr,
  to: Expr,
  proof: ImplyProof,
): TraceStepReason {
  switch (proof.kind) {
    case 'refl':
      return exprStep(implyTrace('refl'), from, to, []);
    case 'rule': {
      const rule = implyTrace(proof.ruleId);
      if (proof.via === undefined) {
        return exprStep(rule, from, to, []);
      }
      return exprStep(rule, from, to, [
        implyProofToChildren(from, to, proof.via),
      ]);
    }
    case 'andConjunct':
      return exprStep(implyTrace('andConjunct'), from, to, [
        implyProofToChildren(proof.conjunct, to, proof.via),
      ]);
    case 'orDisjunct':
      return exprStep(implyTrace('orDisjunct'), from, to, [
        implyProofToChildren(from, proof.disjunct, proof.via),
      ]);
    case 'canon':
      return exprStep(implyTrace('canon'), proof.before, proof.after, [
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
  after: Expr,
  proof: ProveProof,
): readonly TraceReasoning[] {
  const kids: TraceReasoning[] = [...envHowToChildren(proof.fact)];
  if (proof.canon !== undefined) {
    kids.push(
      exprStep(
        implyTrace('canon'),
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
    ...proveProofToChildren(boolLit(true), drop.how.prove),
  ]);
}
