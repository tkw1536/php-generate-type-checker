const INDENT = '    ';

/** Relative indent depth inside the function body (0 = one level = 4 spaces). */
export interface PhpLine {
  readonly depth: number;
  readonly text: string;
}

export function line(depth: number, text: string): PhpLine {
  return { depth, text };
}

export function shiftLines(delta: number, block: readonly PhpLine[]): PhpLine[] {
  return block.map((l) => ({ depth: l.depth + delta, text: l.text }));
}

export function formatBody(block: readonly PhpLine[]): string {
  const baseDepth = 1;
  return block
    .map((l) => INDENT.repeat(baseDepth + l.depth) + l.text)
    .join('\n');
}

export function ifBlock(
  depth: number,
  condition: string,
  body: readonly PhpLine[],
): PhpLine[] {
  return [
    line(depth, `if (${condition}) {`),
    ...shiftLines(1, body),
    line(depth, '}'),
  ];
}

export function ifBlockMultilineOr(
  depth: number,
  orParts: readonly string[],
  body: readonly PhpLine[],
): PhpLine[] {
  if (orParts.length === 0) {
    return [];
  }
  if (orParts.length === 1) {
    return ifBlock(depth, orParts[0], body);
  }
  const head: PhpLine[] = [line(depth, 'if (')];
  for (let i = 0; i < orParts.length; i++) {
    const part = orParts[i].trim();
    const suffix = i < orParts.length - 1 ? ' ||' : '';
    head.push(line(depth + 1, `${part}${suffix}`));
  }
  head.push(line(depth, ') {'));
  return [...head, ...shiftLines(1, body), line(depth, '}')];
}

export function returnMultilineAnd(
  depth: number,
  andParts: readonly string[],
): PhpLine[] {
  if (andParts.length === 0) {
    return [];
  }
  if (andParts.length === 1) {
    return [line(depth, `return ${andParts[0]};`)];
  }
  const out: PhpLine[] = [
    line(depth, 'return ('),
    line(depth + 1, andParts[0].trim()),
  ];
  for (let i = 1; i < andParts.length; i++) {
    out.push(line(depth + 1, `&& ${andParts[i].trim()}`));
  }
  out.push(line(depth, ');'));
  return out;
}
