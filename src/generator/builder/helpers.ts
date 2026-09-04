import type { TypeNode } from '../../parser/ast.ts';
import type { Block, Expr, ValueRef } from '../ir/types.ts';
import {
  andExpr,
  binExpr,
  boolLit,
  callExpr,
  literalArg,
  refArg,
} from '../ir/index.ts';
import {
  isBareEmptyCollectionKeyword,
  isIterableKeyword,
  isListKeyword,
  isNonEmptyKeyword,
  shapeIsObject,
} from './ast/collection.ts';
import { isMixed, isNever } from './ast/classify.ts';

export type EmitOptions = {
  readonly unionRoot: boolean;
  readonly skipContainerGuard: boolean;
  readonly provenArray: boolean;
  readonly provenObject: boolean;
  readonly inLoop: boolean;
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

export function provenContainerAfter(member: TypeNode): {
  array: boolean;
  object: boolean;
} {
  if (member.kind === 'shape' && shapeIsObject(member)) {
    return { array: false, object: true };
  }
  if (member.kind === 'shape') {
    return { array: true, object: false };
  }
  if (isBareEmptyCollectionKeyword(member)) {
    return { array: true, object: false };
  }
  if (member.kind === 'collection' && isListKeyword(member.keyword)) {
    return { array: true, object: false };
  }
  if (member.kind === 'collection' && !isIterableKeyword(member.keyword)) {
    return { array: true, object: false };
  }
  if (member.kind === 'array') {
    return { array: true, object: false };
  }
  return { array: false, object: false };
}

export function listElementType(
  node: Extract<TypeNode, { kind: 'collection' }>,
): TypeNode {
  if ('value' in node) {
    return node.value;
  }
  return { kind: 'keyword', keyword: 'mixed' };
}

export function shapeListElementType(
  node: Extract<TypeNode, { kind: 'shape' }>,
): TypeNode {
  if (node.fields.length === 1) {
    return node.fields[0].value;
  }
  return { kind: 'keyword', keyword: 'mixed' };
}

export function compactListElementTest(
  keyword:
    | Extract<TypeNode, { kind: 'collection' }>['keyword']
    | Extract<TypeNode, { kind: 'shape' }>['keyword'],
  el: TypeNode,
  subject: ValueRef,
): Expr | null {
  if (isNever(el)) {
    return isNonEmptyKeyword(keyword)
      ? boolLit(false)
      : binExpr('===', refArg(subject), literalArg('[]'));
  }
  if (isMixed(el)) {
    const listOk = andExpr([
      callExpr('is_array', [refArg(subject)]),
      callExpr('array_is_list', [refArg(subject)]),
    ]);
    return isNonEmptyKeyword(keyword)
      ? andExpr([
          listOk,
          binExpr('!==', refArg(subject), literalArg('[]')),
        ])
      : listOk;
  }
  return null;
}

export function isArrayCollectionKeyword(keyword: string): boolean {
  return keyword === 'array' || keyword === 'non-empty-array';
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
