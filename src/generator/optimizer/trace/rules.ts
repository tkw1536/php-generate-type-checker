import type { OptimizeTraceRuleId } from './types.ts';

export type OptimizeTraceRuleInfo = {
  readonly title: string;
  readonly help: string;
};

const RULES: Record<OptimizeTraceRuleId, OptimizeTraceRuleInfo> = {
  'trace.initial': {
    title: 'Initial checker',
    help: 'The checker IR produced by Build, before any Optimize rewrite. Always listed first for each program so you can compare the unoptimized body to later steps.',
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
    help: 'Replaces a call_checker with the callee’s body (or its single return expression) after substituting the subject. The inlined helper name is listed under the rewrite. Sound when the callee is a non-entry helper that cannot recurse into the current program: the call’s meaning is defined as running that body on the same subject.',
  },
  'inline.negate': {
    title: 'Negate inlined body',
    help: 'Flips return polarity when inlining under NOT (return E becomes return !E, recursively through if/foreach bodies). Sound because the meaning of !f(x) is the negation of f(x)’s result.',
  },
  'facts.env.extend': {
    title: 'Extend fact environment',
    help: 'Records facts assumed or derived on a control-flow path (if-true body, if-false fallthrough, foreach key, AND conjunct). Nested steps show each add. Does not change checker IR by itself.',
  },
  'facts.env.assumed': {
    title: 'Assume fact',
    help: 'Seeds a fact directly from the path (if condition held/failed, or foreach array key shape).',
  },
  'facts.env.andSplit': {
    title: 'Split AND fact',
    help: 'From a known-true AND, each conjunct is also true.',
  },
  'facts.env.orSplit': {
    title: 'Split OR fact',
    help: 'From a known-false OR, each disjunct is also false.',
  },
  'facts.env.notFlip': {
    title: 'Flip NOT fact',
    help: 'Known-true ¬P means P is false (and the reverse).',
  },
  'facts.env.commute': {
    title: 'Commute equality fact',
    help: 'Swaps === / !== operands so either order matches as the same fact.',
  },
  'facts.env.deMorgan': {
    title: 'De Morgan fact',
    help: 'Rewrites a junction via De Morgan when expanding the fact environment.',
  },
  'facts.env.exclusive': {
    title: 'Exclusive type fact',
    help: 'Other primary-type tags are false when one tag is known.',
  },
  'facts.env.equalityType': {
    title: 'Equality type fact',
    help: 'Typed literal equality implies the matching is_* check.',
  },
  'facts.env.instanceofObject': {
    title: 'Instanceof object fact',
    help: 'From $x instanceof T implying is_object($x).',
  },
  'facts.env.isAClassExists': {
    title: 'is_a class_exists fact',
    help: 'is_a(..., TRUE) implies class_exists on the subject.',
  },
  'facts.proveTrue': {
    title: 'Prove expression true',
    help: 'Replaces an expression with true because path facts entail it. Nested children are a full proof (env derivation + equals/entails). Sound because any value reaching this point already satisfies those facts.',
  },
  'facts.proveFalse': {
    title: 'Prove expression false',
    help: 'Replaces an expression with false because path facts refute it. Nested children are a full proof. Sound for the same reason as prove-true.',
  },
  'facts.prove.equals': {
    title: 'Fact equals conclusion',
    help: 'The folded expression equals a known fact (after canonicalization when needed).',
  },
  'facts.prove.entails': {
    title: 'Fact entails conclusion',
    help: 'A known fact entails the folded expression (or its negation); nested children show the entailment bridge.',
  },
  'facts.imply.refl': {
    title: 'Implication refl',
    help: 'A ⇒ A by reflexivity.',
  },
  'facts.imply.exclusive': {
    title: 'Implication exclusive',
    help: 'Primary-type exclusivity: knowing one tag implies another tag is false / incompatible form.',
  },
  'facts.imply.instanceofObject': {
    title: 'Implication instanceof',
    help: '$x instanceof T ⇒ is_object($x).',
  },
  'facts.imply.isAClassExists': {
    title: 'Implication is_a',
    help: 'is_a(..., TRUE) ⇒ class_exists on the subject.',
  },
  'facts.imply.emptyArrayCount': {
    title: 'Implication empty array count',
    help: '$x === [] ⇒ count($x) === 0. Always sound: the empty array has count zero.',
  },
  'facts.imply.arrayKeyExistsNonEmpty': {
    title: 'Implication array_key_exists non-empty',
    help: 'array_key_exists($k, $x) ⇒ $x !== []. Sound because a key cannot exist on the empty array.',
  },
  'facts.imply.arrayKeyExistsCountNonZero': {
    title: 'Implication array_key_exists count',
    help: 'array_key_exists($k, $x) ⇒ count($x) !== 0. Sound because a present key means at least one element.',
  },
  'facts.imply.countPositiveNonEmpty': {
    title: 'Implication positive count non-empty',
    help: 'count($x) === N (N≥1) ⇒ $x !== []. Sound because the empty array has count zero.',
  },
  'facts.imply.equalityType': {
    title: 'Implication equality type',
    help: 'Typed literal equality implies an is_* check (then further implications).',
  },
  'facts.normalize.countEmpty': {
    title: 'Normalize empty count',
    help: 'Under a known-true is_array($x), rewrites count($x) === 0 to $x === [] (and !== to !== []). Not sound for arbitrary Countable; nested children prove the is_array premise.',
  },
  'facts.imply.andConjunct': {
    title: 'Implication AND conjunct',
    help: 'A ∧ B ⇒ C because a conjunct implies C.',
  },
  'facts.imply.orDisjunct': {
    title: 'Implication OR disjunct',
    help: 'A ⇒ A ∨ B (or A implies some disjunct).',
  },
  'facts.imply.canon': {
    title: 'Canonicalize for match',
    help: 'Expands bins / pushes NOTs so two expressions match as the same fact.',
  },
  'facts.absorb': {
    title: 'Absorb under facts',
    help: 'Drops a redundant AND/OR operand when implication holds. Nested children prove each A ⇒ B (structural or via path facts).',
  },
  'facts.absorb.implies': {
    title: 'Absorb implication',
    help: 'One operand implies another, justifying the drop; nested children are the implication proof.',
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
    help: 'Rewrites !!x into normalize(x) as one step. Nested cleanup from that normalize (if any) is listed under the rewrite. Sound because boolean negation is an involution: applying it twice yields the original truth value.',
  },
  'simplify.normalize.deMorgan': {
    title: 'Apply De Morgan',
    help: 'Pushes negation through a junction and normalizes the result in one step (e.g. !(!a && !b) → a || b). Nested cleanup from that normalize (double-neg, identity, etc.) is listed under the rewrite when present. Sound by De Morgan’s laws plus the soundness of the nested normalize.',
  },
  'simplify.normalize.factor': {
    title: 'Factor common operands',
    help: 'Factors a shared conjunct out of an OR-of-ANDs (or dually for AND-of-ORs) and normalizes the factored form in one step. Nested cleanup from that normalize is listed under the rewrite when present. Sound by distributivity: (a && b) || (a && c) ≡ a && (b || c).',
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
  'simplify.normalize.reorder': {
    title: 'Reorder operands',
    help: 'Sorts AND/OR operands into a canonical order (type proofs, then non-member count compares, then key/exists checks, then member checks). Sound because ∧/∨ are commutative and associative for boolean values.',
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
    help: 'Deletes a non-entry helper that nothing calls anymore. The removed helper name is listed under the rewrite. Sound because unreachable helpers are never invoked at runtime; entry checkers are never pruned, so the public API stays intact.',
  },
};

export function optimizeTraceRuleInfo(
  rule: OptimizeTraceRuleId,
): OptimizeTraceRuleInfo {
  return RULES[rule];
}
