import type { TypeNode } from '../../parser/ast.ts';
import type { Block, Expr } from '../ir/types.ts';

export type EmitOptions = {
  readonly insideShapeField: boolean;
};

export const UNCHECKABLE_KEYWORDS = new Set([
  'void',
  'static',
  '$this',
  'self',
  'parent',
]);

export function flattenAlternatives(node: TypeNode): TypeNode[] {
  if (node.kind === 'union') {
    return node.types.flatMap(flattenAlternatives);
  }
  return [node];
}

export function listElementType(
  node: Extract<TypeNode, { kind: 'collection' }>,
): TypeNode {
  if ('value' in node) {
    return node.value;
  }
  return { kind: 'keyword', keyword: 'mixed' };
}

export function phpKeyLiteral(key: string | number): string {
  if (typeof key === 'number') {
    return String(key);
  }
  return `'${key.replaceAll('\\', '\\\\').replaceAll('\'', "\\'")}'`;
}

export function phpLiteralFromNode(
  node: Extract<TypeNode, { kind: 'literal' }>,
): string | null {
  if (node.type === 'number') {
    return node.value;
  }
  const quote = node.quotes === 'double' ? '"' : "'";
  const escaped = node.value
    .replaceAll('\\', '\\\\')
    .replace(quote, `\\${quote}`);
  return `${quote}${escaped}${quote}`;
}

export function exprAtoms(expr: Expr): readonly Expr[] {
  if (expr.kind === 'and') {
    return expr.exprs;
  }
  return [expr];
}

export function stripTrailingTrueReturn(body: Block): Block {
  return body.filter(
    (s) => !(s.kind === 'return' && s.expr.kind === 'bool' && s.expr.value),
  );
}
