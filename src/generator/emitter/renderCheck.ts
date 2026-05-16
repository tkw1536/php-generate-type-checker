import type { Check } from '../checkerIR.ts';
import { negateExpressionForIf } from '../negateExpression.ts';

function renderCallExpression(check: Extract<Check, { kind: 'call' }>): string {
  if (check.function === '' && check.arguments.length === 1) {
    return check.arguments[0]!;
  }
  if (check.function === 'instanceof' && check.arguments.length === 2) {
    return `${check.arguments[0]} instanceof ${check.arguments[1]}`;
  }
  return `${check.function}(${check.arguments.join(', ')})`;
}

/** Positive predicate (value is valid when this holds). */
export function renderAtom(check: Check): string {
  if (check.kind === 'equals') {
    const eq = `${check.variable} === ${check.literal}`;
    return check.negated ? negateExpressionForIf(eq) : eq;
  }
  return renderCallExpression(check);
}

/** Condition for `if (COND) { return false; }`. */
export function renderFailAtom(check: Check): string {
  if (check.kind === 'equals') {
    const eq = `${check.variable} === ${check.literal}`;
    return check.negated ? negateExpressionForIf(eq) : eq;
  }
  const call = renderCallExpression(check);
  return check.negated ? negateExpressionForIf(call) : call;
}

export function renderPositiveOrChain(checks: Check[]): string {
  return checks.map((c) => renderAtom(c)).join(' || ');
}

export function renderFailUnlessMatch(arms: Check[]): string {
  return negateExpressionForIf(renderPositiveOrChain(arms));
}
