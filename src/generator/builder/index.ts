import type { TypeNode } from '../../parser/ast.ts';
import type { Block, CheckerProgram, ValueRef } from '../ir/types.ts';
import {
  failIfStmt,
  returnStmt,
  boolLit,
  variableRef,
} from '../ir/index.ts';
import type { BuildInput, Context } from './context.ts';
import { isMixed } from './ast/classify.ts';
import {
  bareEmptyCollectionKeywordAsCollection,
  isBareEmptyCollectionKeyword,
} from './ast/collection.ts';
import { cannotBuild } from './errors.ts';
import { buildExpr, buildExprAtoms } from './expr/index.ts';
import { buildCollection, buildPostfixArray } from './statements/collection.ts';
import { buildShape } from './statements/shape.ts';
import {
  buildIntersection,
  buildNestedUnionStmt,
  buildRootUnion,
} from './statements/union.ts';

export function build(
  node: TypeNode,
  parameter: string,
  ctx: BuildInput,
): CheckerProgram {
  const fullCtx: Context = { ...ctx, buildStatements: () => [] };
  fullCtx.buildStatements = (n, s, overrides) =>
    buildStatements(n, s, { ...fullCtx, ...overrides });

  const body = fullCtx.buildStatements(node, variableRef(parameter), {
    includeArrayGuard: true,
    assumeVarIsArray: false,
    assumeVarIsObject: false,
  });
  appendTrailingReturn(body);
  return { parameter, body };
}

function buildStatements(
  node: TypeNode,
  subject: ValueRef,
  ctx: Context,
): Block {
  switch (node.kind) {
    case 'unsupported':
      cannotBuild(
        node,
        `Cannot generate a runtime check for unsupported type: ${node.raw}`,
        node.raw,
      );
    case 'callable':
      cannotBuild(
        node,
        'Cannot generate a runtime check for callable with parameter or return types: parameter and return types cannot be verified without invoking the callable',
        'callable(...)',
      );
    case 'generic':
      cannotBuild(
        node,
        `Cannot generate a runtime check for the generic type ${node.name}: not a supported generic for codegen`,
        `${node.name}<...>`,
      );
    case 'union':
      if (ctx.inLoopBody) {
        return [buildNestedUnionStmt(node, subject, ctx)];
      }
      return buildRootUnion(node, subject, ctx);
    case 'intersection':
      return buildIntersection(node, subject, ctx);
    case 'collection':
      return buildCollection(node, subject, ctx);
    case 'shape':
      return buildShape(node, subject, ctx);
    case 'array':
      return buildPostfixArray(node, subject, ctx);
    case 'keyword':
      if (isBareEmptyCollectionKeyword(node)) {
        return buildCollection(
          bareEmptyCollectionKeywordAsCollection(node),
          subject,
          ctx,
        );
      }
      return buildAtomicStatements(node, subject, ctx);
    default:
      return buildAtomicStatements(node, subject, ctx);
  }
}

function buildAtomicStatements(
  node: TypeNode,
  subject: ValueRef,
  ctx: Context,
): Block {
  if (ctx.checkContext === 'expression') {
    return [failIfStmt(buildExpr(node, subject))];
  }

  const out: Block = [];

  if (isMixed(node)) {
    return out;
  }
  if (node.kind === 'union') {
    out.push(buildNestedUnionStmt(node, subject, ctx));
    return out;
  }

  if (isCompositeType(node)) {
    return ctx.buildStatements(node, subject, ctx);
  }

  if (node.kind === 'keyword' && (node.keyword === 'never' || node.keyword === 'noreturn')) {
    out.push(returnStmt(boolLit(false)));
    return out;
  }
  const atoms = buildExprAtoms(node, subject);
  for (const atom of atoms) {
    out.push(failIfStmt(atom));
  }
  return out;
}

/** Types that require statement-level codegen (foreach, shape fields, etc.). */
function isCompositeType(node: TypeNode): boolean {
  switch (node.kind) {
    case 'collection':
    case 'shape':
    case 'array':
      return true;
    case 'keyword':
      return isBareEmptyCollectionKeyword(node);
    case 'union':
      return node.types.some(isCompositeType);
    case 'intersection':
      return node.types.some(isCompositeType);
    default:
      return false;
  }
}

function appendTrailingReturn(body: Block): void {
  const last = body[body.length - 1];
  if (last?.kind === 'return') {
    return;
  }
  body.push(returnStmt(boolLit(true)));
}
