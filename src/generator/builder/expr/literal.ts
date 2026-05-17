import type { TypeNode } from '../../../parser/ast.ts';

/** PHP source for a parsed literal {@link TypeNode}. */
export function phpLiteralFromNode(
  node: Extract<TypeNode, { kind: 'literal' }>,
): string | null {
  if (node.type === 'number') {
    return node.value;
  }
  const quote = node.quotes === 'double' ? '"' : "'";
  const escaped = node.value
    .replace(/\\/g, '\\\\')
    .replace(quote, `\\${quote}`);
  return `${quote}${escaped}${quote}`;
}
