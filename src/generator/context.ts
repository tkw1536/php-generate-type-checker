const INDENT = '    ';

/** Relative indent depth inside the function body (0 = one level = 4 spaces). */
export interface PhpLine {
  depth: number;
  text: string;
}

export function line(depth: number, text: string): PhpLine {
  return { depth, text };
}

export function lines(depth: number, texts: string[]): PhpLine[] {
  return texts.map((text) => line(depth, text));
}

/** Increase depth of all lines by `delta`. */
export function shiftLines(delta: number, block: PhpLine[]): PhpLine[] {
  return block.map((l) => ({ depth: l.depth + delta, text: l.text }));
}

export function formatBody(block: PhpLine[]): string {
  const baseDepth = 1;
  return block
    .map((l) => INDENT.repeat(baseDepth + l.depth) + l.text)
    .join('\n');
}

export function ifBlock(
  depth: number,
  condition: string,
  body: PhpLine[],
): PhpLine[] {
  return [
    line(depth, `if (${condition}) {`),
    ...shiftLines(1, body),
    line(depth, '}'),
  ];
}

export function braceBlock(depth: number, body: PhpLine[]): PhpLine[] {
  return [line(depth, '{'), ...shiftLines(1, body), line(depth, '}')];
}
