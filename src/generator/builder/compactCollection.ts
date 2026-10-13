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
  const rest = type.rest;
  if (rest === undefined) {
    // Sealed empty: only `[]` (non-empty sealed empty is never).
    return isNonEmptyKeyword(type.keyword)
      ? boolLit(false)
      : binExpr('===', refArg(subject), literalArg('[]'));
  }
  if (rest.kind !== 'any') {
    // Typed rest needs a foreach — not a compact expression.
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
  if (type.kind === 'collection' && isListKeyword(type.keyword)) {
    return compactListElementTest(
      type.keyword,
      listElementType(type),
      subject,
    );
  }
  // List shapes: only unsealed-any with a single mixed slot can collapse to a
  // bare list guard; sealed / typed-rest shapes need field + extra-key IR.
  if (
    type.kind === 'shape' &&
    !shapeIsObject(type) &&
    isListKeyword(type.keyword) &&
    type.rest?.kind === 'any' &&
    type.fields.length === 1 &&
    isMixed(type.fields[0].value)
  ) {
    return compactListElementTest(
      type.keyword,
      type.fields[0].value,
      subject,
    );
  }
  return null;
}
