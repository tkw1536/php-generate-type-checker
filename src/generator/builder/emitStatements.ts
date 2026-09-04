import type { TypeNode } from '../../parser/ast.ts';
import type { Block, Expr, Stmt, ValueRef } from '../ir/types.ts';
import {
  boolLit,
  callCheckerExpr,
  failIfStmt,
  orExpr,
  returnStmt,
} from '../ir/index.ts';
import { GenerationError } from '../errors.ts';
import {
  bareEmptyCollectionKeywordAsShape,
  isBareEmptyCollectionKeyword,
} from './ast/collection.ts';
import { cannotBuild } from './errors.ts';
import type { EmitCtx } from './emitCtx.ts';
import { emitCollection, emitPostfixArray } from './emitCollection.ts';
import { emitShape } from './emitShape.ts';
import {
  type EmitOptions,
  flattenAlternatives,
  provenContainerAfter,
} from './helpers.ts';

export function checkIntersection(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'intersection' }>,
  subject: ValueRef,
): Block {
  const out: Stmt[] = [];
  let provenArray = false;
  let provenObject = false;
  for (const member of node.types) {
    out.push(
      ...ctx.emitStatements(member, subject, {
        unionRoot: false,
        skipContainerGuard: false,
        provenArray,
        provenObject,
        inLoop: false,
        insideShapeField: false,
      }),
    );
    if (provenContainerAfter(member).array) {
      provenArray = true;
    }
    if (provenContainerAfter(member).object) {
      provenObject = true;
    }
  }
  return out;
}

export function emitStatements(
  ctx: EmitCtx,
  type: TypeNode,
  subject: ValueRef,
  opts: EmitOptions,
): Block {
  switch (type.kind) {
    case 'unsupported':
      return cannotBuild(
        type,
        `Cannot generate a runtime check for unsupported type: ${type.raw}`,
        type.raw,
      );
    case 'callable':
      return cannotBuild(
        type,
        'Cannot generate a runtime check for callable with parameter or return types: parameter and return types cannot be verified without invoking the callable',
        'callable(...)',
      );
    case 'generic':
      return cannotBuild(
        type,
        `Cannot generate a runtime check for the generic type ${type.name}: not a supported generic for codegen`,
        `${type.name}<...>`,
      );
    case 'union':
      if (opts.unionRoot) {
        return unionOrAtRoot(ctx, type, subject);
      }
      return [unionOrInline(ctx, type, subject)];
    case 'intersection':
      return checkIntersection(ctx, type, subject);
    case 'collection':
      return emitCollection(ctx, type, subject, opts);
    case 'shape':
      return emitShape(ctx, type, subject, opts);
    case 'array':
      return emitPostfixArray(ctx, type, subject, opts);
    case 'keyword':
      if (isBareEmptyCollectionKeyword(type)) {
        return emitShape(
          ctx,
          bareEmptyCollectionKeywordAsShape(type),
          subject,
          opts,
        );
      }
      return emitKeywordStatements(ctx, type, subject);
    case 'named':
    case 'literal':
    case 'range':
      return emitAtomicStatements(ctx, type, subject);
    default:
      throw new Error('never reached');
  }
}

function emitKeywordStatements(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'keyword' }>,
  subject: ValueRef,
): Block {
  if (node.keyword === 'mixed') {
    return [];
  }
  if (node.keyword === 'never' || node.keyword === 'noreturn') {
    return [returnStmt(boolLit(false))];
  }
  const atoms = ctx.booleanAtoms(node, subject);
  const out: Stmt[] = [];
  for (const atom of atoms) {
    out.push(failIfStmt(atom));
  }
  return out;
}

function emitAtomicStatements(
  ctx: EmitCtx,
  type: TypeNode,
  subject: ValueRef,
): Block {
  const atoms = ctx.booleanAtoms(type, subject);
  const out: Stmt[] = [];
  for (const atom of atoms) {
    out.push(failIfStmt(atom));
  }
  return out;
}

function unionOrAtRoot(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'union' }>,
  subject: ValueRef,
): Block {
  const arms = flattenAlternatives(node).map((member) =>
    unionArmExpr(ctx, member, subject),
  );
  return [failIfStmt(orExpr(arms))];
}

function unionOrInline(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'union' }>,
  subject: ValueRef,
): Stmt {
  const arms = flattenAlternatives(node).map((member) =>
    unionArmExpr(ctx, member, subject),
  );
  return failIfStmt(orExpr(arms));
}

function unionArmExpr(
  ctx: EmitCtx,
  member: TypeNode,
  subject: ValueRef,
): Expr {
  const compact = ctx.compactCollectionTest(member, subject);
  if (compact !== null) {
    return compact;
  }
  try {
    return ctx.booleanForType(member, subject);
  } catch (error) {
    if (!(error instanceof GenerationError)) {
      throw error;
    }
  }
  return callCheckerExpr(ctx.getOrEmitProgram(member), subject);
}
