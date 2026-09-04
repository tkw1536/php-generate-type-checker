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
  const out: Stmt[] = [];
  const objectShape = shapeIsObject(node);

  if (!objectShape && node.fields.length === 0) {
    if (isListKeyword(node.keyword)) {
      out.push(
        ...ctx.listGuards(base, opts, isNonEmptyKeyword(node.keyword)),
      );
      return out;
    }
    if (isNonEmptyKeyword(node.keyword)) {
      out.push(
        ...ctx.arrayGuards(
          base,
          opts,
          true,
          isIterableKeyword(node.keyword),
        ),
      );
      return out;
    }
    out.push(failIfStmt(binExpr('===', refArg(base), literalArg('[]'))));
    return out;
  }

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

  let nextUnkeyedSlot = 0;
  for (const field of node.fields) {
    let fieldRef: ValueRef;
    let keyLit: string;
    if (field.key === null) {
      const slot = nextUnkeyedSlot++;
      keyLit = phpKeyLiteral(slot);
      fieldRef = objectShape
        ? propertyAccessRef(base, String(slot))
        : arrayAccessRef(base, slot);
    } else {
      keyLit = phpKeyLiteral(field.key);
      fieldRef = objectShape
        ? propertyAccessRef(base, String(field.key))
        : arrayAccessRef(base, field.key);
    }

    if (!field.optional) {
      if (objectShape) {
        out.push(
          failIfStmt(
            callExpr('property_exists', [refArg(base), literalArg(keyLit)]),
          ),
        );
      } else {
        out.push(
          failIfStmt(
            callExpr('array_key_exists', [
              literalArg(keyLit),
              refArg(base),
            ]),
          ),
        );
      }
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
