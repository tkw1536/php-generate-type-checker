import type { ShapeRest, TypeNode } from '../../parser/ast.ts';
import type { Block, Expr, Stmt, ValueRef } from '../ir/types.ts';
import {
  arrayAccessRef,
  binExpr,
  boolLit,
  callArg,
  callExpr,
  failIfStmt,
  literalArg,
  notExpr,
  orExpr,
  propertyAccessRef,
  refArg,
} from '../ir/index.ts';
import {
  isIterableKeyword,
  isListKeyword,
  isNonEmptyKeyword,
  shapeIsObject,
} from './ast/collection.ts';
import { isMixed } from './ast/classify.ts';
import type { EmitCtx } from './emitCtx.ts';
import { phpKeyLiteral, stripTrailingTrueReturn } from './helpers.ts';

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
  const rest = node.rest;
  if (rest === undefined) {
    // Sealed empty: non-empty ∩ no keys is impossible; otherwise is_array + count === 0
    // (optimizer rewrites count === 0 → === [] under known is_array).
    if (isNonEmptyKeyword(node.keyword)) {
      return [failIfStmt(boolLit(false))];
    }
    return [
      failIfStmt(callExpr('is_array', [refArg(base)])),
      sealedCountGuard(base, 0),
    ];
  }
  if (rest.kind === 'any') {
    if (isListKeyword(node.keyword)) {
      return [...ctx.listGuards(base, isNonEmptyKeyword(node.keyword))];
    }
    if (isNonEmptyKeyword(node.keyword)) {
      return [
        ...ctx.arrayGuards(base, true, isIterableKeyword(node.keyword)),
      ];
    }
    return [failIfStmt(callExpr('is_array', [refArg(base)]))];
  }
  // Typed rest with no known keys: container guards + foreach over all entries.
  return [
    ...emitShapeContainerGuards(ctx, node, base, false),
    emitExtraKeysForeach(ctx, base, [], rest),
  ];
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
  const knownKeys: (string | number)[] = [];
  let nextUnkeyedSlot = 0;
  for (const field of node.fields) {
    let key: string | number;
    if (field.key === null) {
      key = nextUnkeyedSlot;
      nextUnkeyedSlot++;
    } else {
      key = field.key;
    }
    knownKeys.push(key);
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
  if (!objectShape) {
    const extra = emitExtraKeysStmt(ctx, node, base, knownKeys);
    if (extra !== null) {
      out.push(extra);
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

function emitExtraKeysStmt(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'shape' }>,
  base: ValueRef,
  knownKeys: readonly (string | number)[],
): Stmt | null {
  const rest = node.rest;
  if (rest !== undefined && rest.kind === 'any') {
    return null;
  }
  if (rest === undefined) {
    // All required (incl. zero fields): count === N is equivalent to no extras.
    // Any optional field: must foreach (count alone is not sound).
    if (node.fields.every((field) => !field.optional)) {
      return sealedCountGuard(base, knownKeys.length);
    }
    return emitExtraKeysForeach(ctx, base, knownKeys, { kind: 'sealed' });
  }
  return emitExtraKeysForeach(ctx, base, knownKeys, rest);
}

function sealedCountGuard(base: ValueRef, n: number): Stmt {
  return failIfStmt(
    binExpr('===', callArg('count', [refArg(base)]), literalArg(String(n))),
  );
}

/** Internal: sealed is “reject any non-known key”. */
type ExtraRest = ShapeRest | { readonly kind: 'sealed' };

function emitExtraKeysForeach(
  ctx: EmitCtx,
  base: ValueRef,
  knownKeys: readonly (string | number)[],
  rest: ExtraRest,
): Stmt {
  const keyRef = ctx.freshVar();
  const valueRef = ctx.freshVar();
  const inner = emitExtraKeysBody(ctx, keyRef, valueRef, rest);
  const body =
    knownKeys.length === 0
      ? inner
      : [
          {
            kind: 'if' as const,
            cond: notExpr(knownKeysMatchExpr(keyRef, knownKeys)),
            body: inner,
          },
        ];
  return {
    kind: 'foreach',
    iterable: base,
    keyVar: tempVarId(keyRef),
    valueVar: tempVarId(valueRef),
    body: stripTrailingTrueReturn(body),
  };
}

function emitExtraKeysBody(
  ctx: EmitCtx,
  keyRef: ValueRef,
  valueRef: ValueRef,
  rest: ExtraRest,
): Block {
  switch (rest.kind) {
    case 'sealed':
      return [{ kind: 'return', expr: boolLit(false) }];
    case 'any':
      return [];
    case 'values': {
      if (isMixed(rest.value)) {
        return [];
      }
      return [...ctx.checkInValueLoop(rest.value, valueRef)];
    }
    case 'entries': {
      const out: Stmt[] = [];
      if (!isMixed(rest.key)) {
        out.push(failIfStmt(ctx.booleanForType(rest.key, keyRef)));
      }
      if (!isMixed(rest.value)) {
        out.push(...ctx.checkInValueLoop(rest.value, valueRef));
      }
      return out;
    }
    default:
      throw new Error('never reached');
  }
}

function knownKeysMatchExpr(
  keyRef: ValueRef,
  knownKeys: readonly (string | number)[],
): Expr {
  const parts = knownKeys.map((key) =>
    binExpr('===', refArg(keyRef), literalArg(phpKeyLiteral(key))),
  );
  return orExpr(parts);
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

function tempVarId(ref: ValueRef): number {
  if (ref.kind !== 'variable') {
    throw new Error('expected variable ValueRef from freshVar()');
  }
  return ref.id;
}
