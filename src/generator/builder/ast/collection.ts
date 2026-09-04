import type { TypeNode } from '../../../parser/ast.ts';

type BareEmptyCollectionKeyword =
  | 'list'
  | 'non-empty-list'
  | 'non-empty-array';

export function isBareEmptyCollectionKeyword(
  node: TypeNode,
): node is { kind: 'keyword'; keyword: BareEmptyCollectionKeyword } {
  return (
    node.kind === 'keyword' &&
    (node.keyword === 'list' ||
      node.keyword === 'non-empty-list' ||
      node.keyword === 'non-empty-array')
  );
}

/** Parser emits bare collection keywords; codegen treats them as `keyword<>`. */
export function bareEmptyCollectionKeywordAsShape(
  node: {
    readonly kind: 'keyword';
    readonly keyword: BareEmptyCollectionKeyword;
  },
): Extract<TypeNode, { kind: 'shape' }> {
  return { kind: 'shape', fields: [], keyword: node.keyword };
}

type CollectionKeyword = Extract<
  TypeNode,
  { kind: 'collection' }
>['keyword'];

type ShapeKeyword = Extract<TypeNode, { kind: 'shape' }>['keyword'];

export function isNonEmptyKeyword(
  keyword: CollectionKeyword | ShapeKeyword,
): boolean {
  return keyword.startsWith('non-empty-');
}

export function isIterableKeyword(
  keyword: CollectionKeyword | ShapeKeyword,
): boolean {
  return keyword === 'iterable' || keyword === 'non-empty-iterable';
}

export function isListKeyword(
  keyword: CollectionKeyword | ShapeKeyword,
): boolean {
  return keyword === 'list' || keyword === 'non-empty-list';
}

export function shapeIsObject(
  shape: Extract<TypeNode, { kind: 'shape' }>,
): boolean {
  return shape.keyword === 'object';
}
