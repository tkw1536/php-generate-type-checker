import type { TypeNode } from '../../parser/ast.ts';
import type { Expr, ValueRef } from '../ir/types.ts';
import {
  andExpr,
  binExpr,
  boolLit,
  callExpr,
  literalArg,
  refArg,
} from '../ir/index.ts';
import {
  bareEmptyCollectionKeywordAsShape,
  isBareEmptyCollectionKeyword,
  isIterableKeyword,
  isListKeyword,
  isNonEmptyKeyword,
  shapeIsObject,
} from './ast/collection.ts';
import { isMixed, isNever } from './ast/classify.ts';
import type { EmitCtx } from './emitCtx.ts';
import {
  compactListElementTest,
  isArrayCollectionKeyword,
  listElementType,
  shapeListElementType,
} from './helpers.ts';

export function compactCollectionTest(
  ctx: EmitCtx,
  type: TypeNode,
  subject: ValueRef,
): Expr | null {
  if (isBareEmptyCollectionKeyword(type)) {
    return ctx.compactCollectionTest(
      bareEmptyCollectionKeywordAsShape(type),
      subject,
    );
  }
  if (isMixed(type)) {
    return boolLit(true);
  }
  return (
    compactCollectionKind(type, subject) ??
    compactEmptyShape(type, subject) ??
    compactListLike(type, subject) ??
    (type.kind === 'array' && isNever(type.value)
      ? binExpr('===', refArg(subject), literalArg('[]'))
      : null)
  );
}

function compactCollectionKind(
  type: TypeNode,
  subject: ValueRef,
): Expr | null {
  if (type.kind !== 'collection') {
    return null;
  }
  if (isIterableKeyword(type.keyword) && !('key' in type)) {
    const listOk = callExpr('is_iterable', [refArg(subject)]);
    return isNonEmptyKeyword(type.keyword)
      ? andExpr([
          listOk,
          binExpr('!==', refArg(subject), literalArg('[]')),
        ])
      : listOk;
  }
  if ('value' in type && !isNever(type.value) && isMixed(type.value)) {
    if (isListKeyword(type.keyword)) {
      const listCompact = compactListElementTest(
        type.keyword,
        type.value,
        subject,
      );
      if (listCompact !== null) {
        return listCompact;
      }
    }
    const guard = isIterableKeyword(type.keyword) ? 'is_iterable' : 'is_array';
    const arrOk = callExpr(guard, [refArg(subject)]);
    return isNonEmptyKeyword(type.keyword)
      ? andExpr([
          arrOk,
          binExpr('!==', refArg(subject), literalArg('[]')),
        ])
      : arrOk;
  }
  if (
    'value' in type &&
    isNever(type.value) &&
    !isIterableKeyword(type.keyword)
  ) {
    return isNonEmptyKeyword(type.keyword)
      ? boolLit(false)
      : binExpr('===', refArg(subject), literalArg('[]'));
  }
  return null;
}

function compactEmptyShape(type: TypeNode, subject: ValueRef): Expr | null {
  if (type.kind !== 'shape' || shapeIsObject(type) || type.fields.length > 0) {
    return null;
  }
  if (isArrayCollectionKeyword(type.keyword)) {
    const arrOk = callExpr('is_array', [refArg(subject)]);
    return isNonEmptyKeyword(type.keyword)
      ? andExpr([
          arrOk,
          binExpr('!==', refArg(subject), literalArg('[]')),
        ])
      : arrOk;
  }
  if (isListKeyword(type.keyword)) {
    const listOk = andExpr([
      callExpr('is_array', [refArg(subject)]),
      callExpr('array_is_list', [refArg(subject)]),
    ]);
    return isNonEmptyKeyword(type.keyword)
      ? andExpr([
          listOk,
          binExpr('!==', refArg(subject), literalArg('[]')),
        ])
      : listOk;
  }
  return null;
}

function compactListLike(type: TypeNode, subject: ValueRef): Expr | null {
  if (
    !(
      (type.kind === 'collection' && isListKeyword(type.keyword)) ||
      (type.kind === 'shape' &&
        !shapeIsObject(type) &&
        isListKeyword(type.keyword))
    )
  ) {
    return null;
  }
  const el =
    type.kind === 'collection'
      ? listElementType(type)
      : shapeListElementType(type);
  return compactListElementTest(type.keyword, el, subject);
}
