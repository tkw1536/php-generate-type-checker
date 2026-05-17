import type { TypeNode } from '../../parser/ast.ts';

/** Opaque PHP source for a shape/array key (wrap with {@link literalArg} in ir). */
export function phpLiteralKey(key: string | number): string {
  if (typeof key === 'number') {
    return String(key);
  }
  return `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}


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
