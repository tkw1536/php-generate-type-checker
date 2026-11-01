import type { PhpValue } from './phpValue.ts';
import { renderPhpValue } from './render.ts';

/** Soft-cap after string-dedupe. */
export function takeUnique(
  values: readonly PhpValue[],
  limit: number,
): readonly PhpValue[] {
  const seen = new Set<string>();
  const out: PhpValue[] = [];
  for (const value of values) {
    const key = renderPhpValue(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

/** Drop candidates whose rendered PHP equals a positive example. */
export function withoutPositives(
  candidates: readonly PhpValue[],
  positives: readonly PhpValue[],
): readonly PhpValue[] {
  if (positives.length === 0) {
    return candidates;
  }
  const blocked = new Set(positives.map((value) => renderPhpValue(value)));
  return candidates.filter((value) => !blocked.has(renderPhpValue(value)));
}

/** Intersection of value lists by rendered PHP (order follows the first list). */
export function intersectByRender(
  lists: readonly (readonly PhpValue[])[],
): readonly PhpValue[] {
  if (lists.length === 0) {
    return [];
  }
  const [first, ...rest] = lists;
  if (first === undefined) {
    return [];
  }
  if (rest.length === 0) {
    return first;
  }
  const sets = rest.map(
    (list) => new Set(list.map((value) => renderPhpValue(value))),
  );
  return first.filter((value) => {
    const key = renderPhpValue(value);
    return sets.every((set) => set.has(key));
  });
}
