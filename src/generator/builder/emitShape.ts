import type { TypeNode } from '../../parser/ast.ts';
import type { Block, Stmt, ValueRef } from '../ir/types.ts';
import {
  arrayAccessRef,
  binExpr,
  callExpr,
  failIfStmt,
  literalArg,
  propertyAccessRef,
  refArg,
} from '../ir/index.ts';
import {
  isIterableKeyword,
  isListKeyword,
  isNonEmptyKeyword,
  shapeIsObject,
} from './ast/collection.ts';
import type { EmitCtx } from './emitCtx.ts';
import { phpKeyLiteral } from './helpers.ts';

export function emitShape(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'shape' }>,
  base: ValueRef,
): Block {
  const objectShape = shapeIsObject(node);
  if (!objectShape && node.fields.length === 0) {
    return emitEmptyNonObjectShape(ctx, node, base);
  }
  return [
    ...emitShapeContainerGuards(ctx, node, base, objectShape),
    ...emitShapeFields(ctx, node, base, objectShape),
  ];
}

function emitEmptyNonObjectShape(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'shape' }>,
  base: ValueRef,
): Block {
  if (isListKeyword(node.keyword)) {
    return [...ctx.listGuards(base, isNonEmptyKeyword(node.keyword))];
  }
  if (isNonEmptyKeyword(node.keyword)) {
    return [
      ...ctx.arrayGuards(base, true, isIterableKeyword(node.keyword)),
    ];
  }
  return [failIfStmt(binExpr('===', refArg(base), literalArg('[]')))];
}

function emitShapeContainerGuards(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'shape' }>,
  base: ValueRef,
  objectShape: boolean,
): Stmt[] {
  if (objectShape) {
    return [failIfStmt(callExpr('is_object', [refArg(base)]))];
  }
  if (isListKeyword(node.keyword)) {
    return [...ctx.listGuards(base, isNonEmptyKeyword(node.keyword))];
  }
  return [failIfStmt(callExpr('is_array', [refArg(base)]))];
}

function emitShapeFields(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'shape' }>,
  base: ValueRef,
  objectShape: boolean,
): Stmt[] {
  const out: Stmt[] = [];
  let nextUnkeyedSlot = 0;
  for (const field of node.fields) {
    let key: string | number;
    if (field.key === null) {
      key = nextUnkeyedSlot;
      nextUnkeyedSlot++;
    } else {
      key = field.key;
    }
    const keyLit = phpKeyLiteral(key);
    const fieldRef = objectShape
      ? propertyAccessRef(base, String(key))
      : arrayAccessRef(base, key);
    if (!field.optional) {
      out.push(shapeRequiredKeyGuard(base, keyLit, objectShape));
    }
    const fieldBody = ctx.checkShapeField(field.value, fieldRef);
    if (field.optional) {
      const exists = objectShape
        ? callExpr('property_exists', [refArg(base), literalArg(keyLit)])
        : callExpr('array_key_exists', [literalArg(keyLit), refArg(base)]);
      out.push({ kind: 'if', cond: exists, body: fieldBody });
    } else {
      out.push(...fieldBody);
    }
  }
  // move the 'foreach' statements to the end
  // so that all simple conditions can be grouped by the optimizer.
  // This is always sound, because any collection guards will still happen before foreach.
  return [
    ...out.filter((s) => s.kind !== 'foreach'),
    ...out.filter((s) => s.kind === 'foreach'),
  ];
}

function shapeRequiredKeyGuard(
  base: ValueRef,
  keyLit: string,
  objectShape: boolean,
): Stmt {
  if (objectShape) {
    return failIfStmt(
      callExpr('property_exists', [refArg(base), literalArg(keyLit)]),
    );
  }
  return failIfStmt(
    callExpr('array_key_exists', [literalArg(keyLit), refArg(base)]),
  );
}
