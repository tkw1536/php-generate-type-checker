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
import { type EmitOptions, phpKeyLiteral } from './helpers.ts';

export function emitShape(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'shape' }>,
  base: ValueRef,
  opts: EmitOptions,
): Block {
  const objectShape = shapeIsObject(node);
  if (!objectShape && node.fields.length === 0) {
    return emitEmptyNonObjectShape(ctx, node, base, opts);
  }
  return [
    ...emitShapeContainerGuards(ctx, node, base, opts, objectShape),
    ...emitShapeFields(ctx, node, base, objectShape),
  ];
}

function emitEmptyNonObjectShape(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'shape' }>,
  base: ValueRef,
  opts: EmitOptions,
): Block {
  if (isListKeyword(node.keyword)) {
    return [...ctx.listGuards(base, opts, isNonEmptyKeyword(node.keyword))];
  }
  if (isNonEmptyKeyword(node.keyword)) {
    return [
      ...ctx.arrayGuards(base, opts, true, isIterableKeyword(node.keyword)),
    ];
  }
  return [failIfStmt(binExpr('===', refArg(base), literalArg('[]')))];
}

function emitShapeContainerGuards(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'shape' }>,
  base: ValueRef,
  opts: EmitOptions,
  objectShape: boolean,
): Stmt[] {
  const out: Stmt[] = [];
  if (!opts.skipContainerGuard) {
    if (objectShape) {
      if (!opts.provenObject) {
        out.push(failIfStmt(callExpr('is_object', [refArg(base)])));
      }
    } else if (isListKeyword(node.keyword)) {
      out.push(
        ...ctx.listGuards(base, opts, isNonEmptyKeyword(node.keyword)),
      );
    } else if (!opts.provenArray) {
      out.push(failIfStmt(callExpr('is_array', [refArg(base)])));
    }
  } else if (!objectShape && isListKeyword(node.keyword)) {
    out.push(
      ...ctx.listGuards(base, opts, isNonEmptyKeyword(node.keyword)),
    );
  }
  return out;
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
  return out;
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
