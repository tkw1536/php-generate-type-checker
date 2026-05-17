import type { TypeNode } from '../../../parser/ast.ts';
import type { Expr, ValueRef } from '../../ir/types.ts';
import {
  andExpr,
  binExpr,
  boolLit,
  callExpr,
  literalArg,
  refArg,
} from '../../ir/index.ts';
import { isMixed, isNever } from '../ast/classify.ts';
import {
  bareEmptyCollectionKeywordAsCollection,
  isBareEmptyCollectionKeyword,
  isIterableKeyword,
  isListKeyword,
  isNonEmptyKeyword,
} from '../ast/collection.ts';

function isArrayKeyword(keyword: string): boolean {
  return keyword === 'array' || keyword === 'non-empty-array';
}

/** Single-boolean guard for collections that need no foreach; null when a loop is required. */
export function collectionGuardExpr(
  node: TypeNode,
  subject: ValueRef,
): Expr | null {
  if (isBareEmptyCollectionKeyword(node)) {
    return collectionGuardExpr(
      bareEmptyCollectionKeywordAsCollection(node),
      subject,
    );
  }
  if (isMixed(node)) {
    return boolLit(true);
  }
  if (node.kind === 'collection') {
    if (isIterableKeyword(node.keyword) && !('key' in node)) {
      const listOk = callExpr('is_iterable', [refArg(subject)]);
      return isNonEmptyKeyword(node.keyword)
        ? andExpr([listOk, binExpr('!==', refArg(subject), literalArg('[]'))])
        : listOk;
    }
    if ('value' in node && !isNever(node.value) && isMixed(node.value)) {
      const guard = isIterableKeyword(node.keyword) ? 'is_iterable' : 'is_array';
      const arrOk = callExpr(guard, [refArg(subject)]);
      return isNonEmptyKeyword(node.keyword)
        ? andExpr([arrOk, binExpr('!==', refArg(subject), literalArg('[]'))])
        : arrOk;
    }
    if (
      'value' in node &&
      isNever(node.value) &&
      !isIterableKeyword(node.keyword)
    ) {
      return isNonEmptyKeyword(node.keyword)
        ? boolLit(false)
        : binExpr('===', refArg(subject), literalArg('[]'));
    }
    if (
      'values' in node &&
      node.values.length === 0 &&
      isArrayKeyword(node.keyword)
    ) {
      const arrOk = callExpr('is_array', [refArg(subject)]);
      return isNonEmptyKeyword(node.keyword)
        ? andExpr([arrOk, binExpr('!==', refArg(subject), literalArg('[]'))])
        : arrOk;
    }
  }
  if (node.kind === 'collection' && isListKeyword(node.keyword)) {
    const el =
      'value' in node
        ? node.value
        : 'values' in node && node.values.length === 1
          ? node.values[0]
          : null;
    if (el && isNever(el)) {
      return isNonEmptyKeyword(node.keyword)
        ? boolLit(false)
        : binExpr('===', refArg(subject), literalArg('[]'));
    }
    if (el && isMixed(el)) {
      const listOk = andExpr([
        callExpr('is_array', [refArg(subject)]),
        callExpr('array_is_list', [refArg(subject)]),
      ]);
      return isNonEmptyKeyword(node.keyword)
        ? andExpr([listOk, binExpr('!==', refArg(subject), literalArg('[]'))])
        : listOk;
    }
  }
  if (node.kind === 'array' && isNever(node.value)) {
    return binExpr('===', refArg(subject), literalArg('[]'));
  }
  return null;
}
