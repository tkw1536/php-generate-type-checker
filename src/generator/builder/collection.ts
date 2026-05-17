import type { TypeNode } from '../../parser/ast.ts';

/** Keywords the parser emits without `<…>` that mean an empty type-parameter collection. */
export type BareEmptyCollectionKeyword =
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

/** @deprecated Use {@link isBareEmptyCollectionKeyword}. */
export const isBareListKeyword = isBareEmptyCollectionKeyword;

/** Parser emits bare collection keywords; codegen treats them as `keyword<>`. */
export function bareEmptyCollectionKeywordAsCollection(
  node: { kind: 'keyword'; keyword: BareEmptyCollectionKeyword },
): Extract<TypeNode, { kind: 'collection'; values: TypeNode[] }> {
  return { kind: 'collection', values: [], keyword: node.keyword };
}

/** @deprecated Use {@link bareEmptyCollectionKeywordAsCollection}. */
export const bareListKeywordAsCollection = bareEmptyCollectionKeywordAsCollection;

export type CollectionKeyword = Extract<
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

export function isArrayKeyword(keyword: CollectionKeyword): boolean {
  return keyword === 'array' || keyword === 'non-empty-array';
}

export function shapeIsObject(
  shape: Extract<TypeNode, { kind: 'shape' }>,
): boolean {
  return shape.keyword === 'object';
}

/** Element type for list-like collection nodes (`value` or homogeneous `values`). */
export function collectionListElement(
  node: Extract<TypeNode, { kind: 'collection' }>,
): TypeNode | null {
  if ('value' in node) {
    return node.value;
  }
  if ('values' in node && node.values.length > 0) {
    return node.values[0]!;
  }
  return null;
}

/** Whether a collection uses brace/tuple `values` form (not map key+value). */
export function collectionHasValuesForm(
  node: Extract<TypeNode, { kind: 'collection' }>,
): boolean {
  return 'values' in node;
}
