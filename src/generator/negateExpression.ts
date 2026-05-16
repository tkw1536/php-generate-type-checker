/** Strip matching outer parentheses, e.g. `(is_string($x))` → `is_string($x)`. */
export function stripRedundantOuterParens(expr: string): string {
  let e = expr.trim();
  while (e.length >= 2 && e[0] === '(') {
    let depth = 0;
    let matchedAtEnd = false;
    for (let i = 0; i < e.length; i++) {
      const ch = e[i];
      if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) {
          matchedAtEnd = i === e.length - 1;
          break;
        }
      }
    }
    if (matchedAtEnd) {
      e = e.slice(1, -1).trim();
    } else {
      break;
    }
  }
  return e;
}

function hasTopLevelLogicalOp(expr: string): boolean {
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (
      depth === 0 &&
      (expr.startsWith(' || ', i) || expr.startsWith(' && ', i))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Negated `if` condition: use `!foo()` instead of `!(foo())` when the operand is a single
 * predicate; keep `!(a || b)` / `!(a && b)` when grouping matters.
 */
export function negateExpressionForIf(inner: string): string {
  const e = stripRedundantOuterParens(inner);
  if (hasTopLevelLogicalOp(e)) {
    return `!(${e})`;
  }
  if (
    e.includes(' instanceof ') ||
    e.includes(' === ') ||
    e.includes(' !== ') ||
    e.includes(' == ') ||
    e.includes(' != ')
  ) {
    return `!(${e})`;
  }
  return `!${e}`;
}
