import type { TypeNode } from '../../parser/ast.ts';
import type { Block, Stmt, ValueRef } from '../ir/types.ts';
import {
  binExpr,
  boolLit,
  callExpr,
  failIfStmt,
  literalArg,
  refArg,
} from '../ir/index.ts';
import {
  isIterableKeyword,
  isListKeyword,
  isNonEmptyKeyword,
} from './ast/collection.ts';
import { isMixed, isNever } from './ast/classify.ts';
import { cannotBuild } from './errors.ts';
import type { EmitCtx } from './emitCtx.ts';
import {
  type EmitOptions,
  exprAtoms,
  listElementType,
  stripTrailingTrueReturn,
} from './helpers.ts';

export function emitCollection(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'collection' }>,
  subject: ValueRef,
  opts: EmitOptions,
): Block {
  rejectParameterizedIterable(node);

  if (isListKeyword(node.keyword)) {
    return emitList(ctx, node, subject, opts);
  }
  if (isIterableKeyword(node.keyword) && !('key' in node)) {
    return emitBareIterable(ctx, node, subject, opts);
  }
  if ('key' in node) {
    return emitKeyedEntries(ctx, node, subject, opts);
  }
  return emitHomogeneousArray(ctx, node, subject, opts);
}

function rejectParameterizedIterable(
  node: Extract<TypeNode, { kind: 'collection' }>,
): void {
  if (isIterableKeyword(node.keyword) && 'key' in node) {
    cannotBuild(
      node,
      'Cannot generate a runtime check for parameterized iterable: validating keys or elements would require foreach iteration and is not side-effect-free',
    );
  }
  if ('value' in node && isIterableKeyword(node.keyword)) {
    cannotBuild(
      node,
      'Cannot generate a runtime check for parameterized iterable: validating keys or elements would require foreach iteration and is not side-effect-free',
    );
  }
}

export function emitPostfixArray(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'array' }>,
  subject: ValueRef,
  opts: EmitOptions,
): Block {
  if (isNever(node.value)) {
    return [failIfStmt(binExpr('===', refArg(subject), literalArg('[]')))];
  }

  const out: Stmt[] = [];
  if (!opts.skipContainerGuard && !opts.provenArray) {
    out.push(failIfStmt(callExpr('is_array', [refArg(subject)])));
  }

  if (node.value.kind === 'keyword' && node.value.keyword === 'mixed') {
    return out;
  }

  const valueRef = ctx.freshVar();
  const body = ctx.checkInValueLoop(node.value, valueRef);
  out.push(pushForeach(ctx, subject, valueRef, null, body));
  return out;
}

function emitList(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'collection' }>,
  subject: ValueRef,
  opts: EmitOptions,
): Block {
  const nonEmpty = isNonEmptyKeyword(node.keyword);

  const element = listElementType(node);
  if (isNever(element)) {
    if (nonEmpty) {
      return [failIfStmt(boolLit(false))];
    }
    return [
      failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
    ];
  }

  const out = [...ctx.listGuards(subject, opts, nonEmpty)];

  if (element.kind === 'keyword' && element.keyword === 'mixed') {
    return out;
  }

  const valueRef = ctx.freshVar();
  const body = ctx.checkInValueLoop(element, valueRef);
  out.push(pushForeach(ctx, subject, valueRef, null, body));
  return out;
}

function emitBareIterable(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'collection' }>,
  subject: ValueRef,
  opts: EmitOptions,
): Block {
  const nonEmpty = isNonEmptyKeyword(node.keyword);
  const out: Stmt[] = [];
  if (!opts.skipContainerGuard && !opts.provenArray) {
    out.push(failIfStmt(callExpr('is_iterable', [refArg(subject)])));
  }
  if (nonEmpty) {
    out.push(
      failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
    );
  }
  if ('value' in node && !isMixed(node)) {
    const compact = ctx.compactCollectionTest(node, subject);
    if (compact !== null) {
      for (const atom of exprAtoms(compact)) {
        out.push(failIfStmt(atom));
      }
    }
  }
  return out;
}

function emitKeyedEntries(
  ctx: EmitCtx,
  node: Extract<
    TypeNode,
    { kind: 'collection'; key: TypeNode; value: TypeNode }
  >,
  subject: ValueRef,
  opts: EmitOptions,
): Block {
  return emitForeachKeyed(
    ctx,
    subject,
    opts,
    node.key,
    node.value,
    isNonEmptyKeyword(node.keyword),
    false,
  );
}

function emitHomogeneousArray(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'collection'; value: TypeNode }>,
  subject: ValueRef,
  opts: EmitOptions,
): Block {
  const nonEmpty = isNonEmptyKeyword(node.keyword);
  if (isNever(node.value)) {
    if (nonEmpty) {
      return [failIfStmt(boolLit(false))];
    }
    const emptyCheck = opts.insideShapeField
      ? binExpr('!==', refArg(subject), literalArg('[]'))
      : binExpr('===', refArg(subject), literalArg('[]'));
    return [failIfStmt(emptyCheck)];
  }

  const out: Stmt[] = [];

  if (isMixed(node.value)) {
    const compact = ctx.compactCollectionTest(node, subject);
    if (compact !== null) {
      for (const atom of exprAtoms(compact)) {
        out.push(failIfStmt(atom));
      }
      return out;
    }
    out.push(...ctx.arrayGuards(subject, opts, nonEmpty, false));
    return out;
  }

  const compact = ctx.compactCollectionTest(node, subject);
  if (compact !== null) {
    for (const atom of exprAtoms(compact)) {
      out.push(failIfStmt(atom));
    }
    return out;
  }

  out.push(...ctx.arrayGuards(subject, opts, nonEmpty, false));
  return [
    ...out,
    ...emitForeachKeyed(ctx, subject, opts, null, node.value, nonEmpty, true),
  ];
}

function emitForeachKeyed(
  ctx: EmitCtx,
  subject: ValueRef,
  opts: EmitOptions,
  key: TypeNode | null,
  value: TypeNode,
  nonEmpty: boolean,
  skipGuards: boolean,
): Block {
  const out: Stmt[] = [];
  if (!skipGuards) {
    out.push(...ctx.arrayGuards(subject, opts, nonEmpty, false));
  }

  const valueRef = ctx.freshVar();
  const keyRef =
    key !== null && !isMixed(key) ? ctx.freshVar() : null;
  const body: Stmt[] = [];

  if (keyRef !== null && key !== null) {
    body.push(failIfStmt(ctx.booleanForType(key, keyRef)));
  }
  if (!isMixed(value)) {
    body.push(...ctx.checkInValueLoop(value, valueRef));
  }
  out.push(pushForeach(ctx, subject, valueRef, keyRef, body));
  return out;
}

function pushForeach(
  ctx: EmitCtx,
  iterable: ValueRef,
  valueRef: ValueRef,
  keyRef: ValueRef | null,
  body: Block,
): Stmt {
  return {
    kind: 'foreach',
    iterable,
    keyVar: keyRef === null ? null : ctx.varName(keyRef),
    valueVar: ctx.varName(valueRef),
    body: stripTrailingTrueReturn(body),
  };
}

export { arrayGuards, listGuards } from './emitGuards.ts';
