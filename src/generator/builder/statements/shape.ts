import type { TypeNode } from '../../../parser/ast.ts';
import type { Block, ValueRef } from '../../ir/types.ts';
import {
  arrayAccessRef,
  callExpr,
  failIfStmt,
  literalArg,
  propertyAccessRef,
  refArg,
} from '../../ir/index.ts';
import type { Context } from '../context.ts';
import { shapeIsObject } from '../ast/collection.ts';

export function buildShape(
  node: Extract<TypeNode, { kind: 'shape' }>,
  base: ValueRef,
  ctx: Context,
): Block {
  const out: Block = [];
  const objectShape = shapeIsObject(node);
  const root = valueRefRootBase(base);

  if (ctx.includeArrayGuard !== false) {
    if (objectShape) {
      if (!ctx.assumeVarIsObject) {
        out.push(failIfStmt(callExpr('is_object', [refArg(base)])));
      }
    } else if (!ctx.assumeVarIsArray) {
      out.push(failIfStmt(callExpr('is_array', [refArg(base)])));
    }
  }

  for (let i = 0; i < node.fields.length; i++) {
    const field = node.fields[i]!;
    const fieldRef = objectShape
      ? propertyAccessRef(root, String(field.key))
      : arrayAccessRef(root, field.key);
    const keyLit = phpLiteralKey(field.key);

    if (!field.optional) {
      if (objectShape) {
        out.push(
          failIfStmt(
            callExpr('property_exists', [
              refArg(base),
              literalArg(keyLit),
            ]),
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

    const fieldBody = ctx.buildStatements(field.value, fieldRef, {
      ...ctx,
      includeArrayGuard: false,
      inShapeField: true,
      iterable: fieldRef,
    });

    if (field.optional) {
      const exists = objectShape
        ? callExpr('property_exists', [refArg(base), literalArg(keyLit)])
        : callExpr('array_key_exists', [literalArg(keyLit), refArg(base)]);
      out.push({
        kind: 'if',
        cond: exists,
        body: fieldBody,
      });
    } else {
      out.push(...fieldBody);
    }
  }
  return out;
}

function phpLiteralKey(key: string | number): string {
  if (typeof key === 'number') {
    return String(key);
  }
  return `'${key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function valueRefRootBase(ref: ValueRef): string {
  switch (ref.kind) {
    case 'variable':
      return ref.name;
    case 'array_access':
      return ref.base;
    case 'property_access':
      return ref.base;
    default: {
      const _exhaustive: never = ref;
      return _exhaustive;
    }
  }
}
