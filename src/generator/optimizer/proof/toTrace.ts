import type { Expr } from '../../ir/types.ts';
import { boolLit } from '../../ir/index.ts';
import type {
  EnvAddEvent,
  EnvFact,
  EnvHow,
  EnvLeafId,
  FactEntry,
} from '../passes/facts/env.types.ts';
import { entryReason } from '../passes/facts/env.types.ts';
import { exprStep } from '../trace/rewrite.ts';
import type {
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

function envTrace(leaf: EnvLeafId): `facts.env.${EnvLeafId}` {
  return `facts.env.${leaf}`;
}

function implyTrace(leaf: ImplyLeafId): `facts.imply.${ImplyLeafId}` {
  return `facts.imply.${leaf}`;
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
    envTrace(entryReason(fact.how)),
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
      envTrace(entryReason(e.entry.how)),
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
  before: Expr,
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
