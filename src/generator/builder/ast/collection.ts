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
export function bareEmptyCollectionKeywordAsCollection(
  node: { kind: 'keyword'; keyword: BareEmptyCollectionKeyword },
): Extract<TypeNode, { kind: 'collection'; values: TypeNode[] }> {
  return { kind: 'collection', values: [], keyword: node.keyword };
}

type CollectionKeyword = Extract<
  TypeNode,
  { kind: 'collection' }
>['keyword'];

export function isNonEmptyKeyword(keyword: CollectionKeyword): boolean {
  return keyword.startsWith('non-empty-');
}

export function isIterableKeyword(keyword: CollectionKeyword): boolean {
  return keyword === 'iterable' || keyword === 'non-empty-iterable';
}

export function isListKeyword(keyword: CollectionKeyword): boolean {
  return keyword === 'list' || keyword === 'non-empty-list';
}

export function shapeIsObject(
  shape: Extract<TypeNode, { kind: 'shape' }>,
): boolean {
  return shape.keyword === 'object';
}
