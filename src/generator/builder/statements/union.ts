import type { TypeNode } from '../../../parser/ast.ts';
import type { Block, Expr, Stmt, ValueRef } from '../../ir/types.ts';
import {
  callCheckerExpr,
  failIfStmt,
  orExpr,
} from '../../ir/index.ts';
import type { Context } from '../context.ts';
import {
  isBareEmptyCollectionKeyword,
  isIterableKeyword,
  isListKeyword,
  shapeIsObject,
} from '../ast/collection.ts';
import { buildExpr } from '../expr/index.ts';
import { collectionGuardExpr } from '../expr/guard.ts';
import { GenerationError } from "../../errors.ts";

function flattenUnion(node: TypeNode): TypeNode[] {
  if (node.kind === 'union') {
    return node.types.flatMap(flattenUnion);
  }
  return [node];
}

export function buildRootUnion(
  node: Extract<TypeNode, { kind: 'union' }>,
  subject: ValueRef,
  ctx: Context,
): Block {
  const members = flattenUnion(node);
  const arms: Expr[] = [];
  for (const m of members) {
    const inline = unionMemberExpr(m, subject);
    if (inline !== null) {
      arms.push(inline);
      continue;
    }
    arms.push(callCheckerExpr(ctx.resolveCheckerName(m), subject));
  }
  return [failIfStmt(orExpr(arms))];
}

export function buildNestedUnionStmt(
  node: Extract<TypeNode, { kind: 'union' }>,
  subject: ValueRef,
  ctx: Context,
): Stmt {
  const members = flattenUnion(node);
  const arms: Expr[] = members.map((m) => {
    const inline = unionMemberExpr(m, subject);
    if (inline !== null) {
      return inline;
    }
    return callCheckerExpr(ctx.resolveCheckerName(m), subject);
  });
  return failIfStmt(orExpr(arms));
}

export function buildIntersection(
  node: Extract<TypeNode, { kind: 'intersection' }>,
  subject: ValueRef,
  ctx: Context,
): Block {
  const out: Block = [];
  let assumeVarIsArray = Boolean(ctx.assumeVarIsArray);
  let assumeVarIsObject = Boolean(ctx.assumeVarIsObject);
  for (const member of node.types) {
    out.push(
      ...ctx.buildStatements(member, subject, {
        ...ctx,
        assumeVarIsArray,
        assumeVarIsObject,
        includeArrayGuard: true,
      }),
    );
    if (establishesArray(member)) {
      assumeVarIsArray = true;
    }
    if (establishesObject(member)) {
      assumeVarIsObject = true;
    }
  }
  return out;
}

function unionMemberExpr(member: TypeNode, subject: ValueRef): Expr | null {
  const guard = collectionGuardExpr(member, subject);
  if (guard !== null) {
    return guard;
  }
  try {
    return buildExpr(member, subject);
  } catch(error) {
    if (!(error instanceof GenerationError)) {
      throw error;
    }
  }
  return null;
}

function establishesObject(member: TypeNode): boolean {
  return member.kind === 'shape' && shapeIsObject(member);
}

function establishesArray(member: TypeNode): boolean {
  if (member.kind === 'shape' && shapeIsObject(member)) {
    return false;
  }
  if (member.kind === 'shape') {
    return true;
  }
  if (isBareEmptyCollectionKeyword(member)) {
    return true;
  }
  if (member.kind === 'collection' && isListKeyword(member.keyword)) {
    return true;
  }
  if (member.kind === 'collection' && !isIterableKeyword(member.keyword)) {
    return true;
  }
  if (member.kind === 'array') {
    return true;
  }
  return false;
}
