import type { OptimizeTraceRuleId } from './types.ts';

export type OptimizeTraceRuleInfo = {
  readonly title: string;
  readonly help: string;
};

const RULES: Record<OptimizeTraceRuleId, OptimizeTraceRuleInfo> = {
  'trace.baseline': {
    title: 'Unchanged',
    help: 'No Optimize rewrite touched this checker. The body is exactly the IR produced by Build, so the runtime check is unchanged and still matches the generated semantics.',
  },
  'dedupe.drop': {
    title: 'Drop duplicate statement',
    help: 'Removes an if/foreach that is structurally identical to one already kept earlier in the same block. Sound because a second copy of the same control-flow statement cannot change which values are accepted: the first occurrence already performed that test.',
  },
  'unnest.collapse': {
    title: 'Collapse nested if',
    help: 'Rewrites if (a) { if (b) { body } } into if (a && b) { body }. Sound because the body runs exactly when both conditions hold in order; there is no else branch, so failing a or b still skips the body either way.',
  },
  'combine.merge': {
    title: 'Merge same-body ifs',
    help: 'Merges adjacent ifs that share the same body into if (c1 || c2 || …) { body }. Sound because the body executes when any of those conditions succeeds, which is the same as trying each if in sequence when their bodies are identical and there is no intervening side effect in the IR.',
  },
  'flatten.fold': {
    title: 'Fold flatten return',
    help: 'Turns if (a) { return b; } return c; into return (a && b) || (!a && c). Sound by case analysis on a: when a is true the value is b; when a is false the value is c—the same returns the original statements produce.',
  },
  'inline.substitute': {
    title: 'Inline helper call',
    help: 'Replaces a call_checker with the callee’s body (or its single return expression) after substituting the subject. Sound when the callee is a non-entry helper that cannot recurse into the current program: the call’s meaning is defined as running that body on the same subject.',
  },
  'facts.proveTrue': {
    title: 'Prove expression true',
    help: 'Replaces an expression with true because earlier control flow already established facts that entail it (for example after if (P) return, later code may know ¬P). Sound because any concrete value reaching this point already satisfies those facts, so the test cannot fail.',
  },
  'facts.proveFalse': {
    title: 'Prove expression false',
    help: 'Replaces an expression with false because known facts refute it (it equals a known-false fact, or a known-true fact entails its negation). Sound for the same reason: no value that passed the earlier guards can make this expression true.',
  },
  'facts.absorb': {
    title: 'Absorb under facts',
    help: 'Drops a redundant AND/OR operand when implication holds under the current facts (OR: drop a stronger arm implied by a weaker one; AND: drop a weaker conjunct implied by a stronger one). Sound because the kept operands already determine the junction’s truth value on every path that reaches them.',
  },
  'facts.commit': {
    title: 'Commit fact rewrites',
    help: 'Updates the checker body to the block rebuilt by fact substitution when fine-grained expression records could not mirror every local return-path fold (for example after skipping bool-literal replace-all). Sound because the committed block is exactly the facts pass result that later phases optimize.',
  },
  'simplify.expand': {
    title: 'Expand binary ops',
    help: 'Rewrites selected comparisons into equivalent call/boolean forms (for example so later passes can share structure with is_* checks). Sound because each expansion is an identity on PHP values for the operators we emit.',
  },
  'simplify.absorb': {
    title: 'Absorb binary ops',
    help: 'Folds expanded comparison forms back to a simpler binary when normalization leaves an equivalent comparison. Sound as the inverse of expand: the compacted form denotes the same boolean as the expanded one.',
  },
  'simplify.normalize.boolFold': {
    title: 'Fold boolean constant',
    help: 'Applies constant folding under NOT/AND/OR (e.g. !true → false, x && false → false, x || true → true). Sound by the standard truth tables for classical boolean connectives.',
  },
  'simplify.normalize.identity': {
    title: 'Drop boolean identity',
    help: 'Removes true from AND and false from OR (x && true → x, false || x → x), unwrapping the junction when one operand remains. Sound because true is the unit of AND and false is the unit of OR.',
  },
  'simplify.normalize.doubleNeg': {
    title: 'Remove double negation',
    help: 'Rewrites !!x into normalize(x) as one step. Sound because boolean negation is an involution: applying it twice yields the original truth value.',
  },
  'simplify.normalize.deMorgan': {
    title: 'Apply De Morgan',
    help: 'Pushes negation through a junction and normalizes the result in one step (e.g. !(!a && !b) → a || b, including nested double-neg cleanup). Sound by De Morgan’s laws plus the soundness of the nested normalize.',
  },
  'simplify.normalize.factor': {
    title: 'Factor common operands',
    help: 'Factors a shared conjunct out of an OR-of-ANDs (or dually for AND-of-ORs) and normalizes the factored form in one step. Sound by distributivity: (a && b) || (a && c) ≡ a && (b || c).',
  },
  'simplify.normalize.absorb': {
    title: 'Absorb implied operands',
    help: 'Drops an AND/OR operand when another operand structurally implies it (e.g. x || (x && y) → x). Sound by the absorption laws of boolean algebra: the stronger/weaker operand already fixes the junction’s result.',
  },
  'simplify.normalize.contradiction': {
    title: 'Fold contradiction/tautology',
    help: 'Collapses AND containing x && !x (or equivalent) to false, and OR containing x || !x to true. Sound because a contradiction is never satisfied and a tautology always is.',
  },
  'simplify.normalize.dedupe': {
    title: 'Dedupe operands',
    help: 'Removes duplicate operands inside an AND/OR (after sorting for a canonical order). Sound because a && a ≡ a and a || a ≡ a; duplicates do not change the truth value.',
  },
  'dce.dropFalse': {
    title: 'Drop if (false)',
    help: 'Deletes if (false) { body }. Sound because the condition is never true, so the body is unreachable and cannot affect which values the checker accepts.',
  },
  'dce.spliceTrue': {
    title: 'Splice if (true)',
    help: 'Replaces if (true) { body } with body in place. Sound because the guard always succeeds, so executing the body unconditionally is the same control flow.',
  },
  'dce.dropEmptyForeach': {
    title: 'Drop empty foreach',
    help: 'Removes a foreach whose body is empty. Sound because iterating and doing nothing cannot change the checker’s result or fall-through behavior.',
  },
  'dce.foldForeach': {
    title: 'Fold constant foreach',
    help: 'Rewrites foreach ($iter as …) { return E; } into if ($iter !== []) return E when E ignores the loop binders. Sound because IR foreach only runs over arrays: an empty array skips the body; a non-empty array returns E on the first iteration without using the element/key.',
  },
  'dce.dropUnusedKey': {
    title: 'Drop unused foreach key',
    help: 'Omits the foreach key binder when the body never reads it. Sound because an unused binder cannot affect evaluation; PHP still iterates the same values.',
  },
  'dce.dropUnreachable': {
    title: 'Drop unreachable statement',
    help: 'Removes statements after a prefix that always returns in the same block. Sound because those statements can never run, so deleting them cannot change observable checker behavior.',
  },
  'prune.remove': {
    title: 'Prune unused helper',
    help: 'Deletes a non-entry helper that nothing calls anymore. Sound because unreachable helpers are never invoked at runtime; entry checkers are never pruned, so the public API stays intact.',
  },
};

export function optimizeTraceRuleInfo(
  rule: OptimizeTraceRuleId,
): OptimizeTraceRuleInfo {
  return RULES[rule];
}
