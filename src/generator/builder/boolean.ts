import type { Keyword, TypeNode } from '../../parser/ast.ts';
import { isValidPhpClassName } from '../../parser/phpClassName.ts';
import type { Expr, ValueRef } from '../ir/types.ts';
import {
  andExpr,
  binExpr,
  callCheckerExpr,
  callExpr,
  instanceofExpr,
  literalArg,
  orExpr,
  refArg,
} from '../ir/index.ts';
import { cannotBuild, describeNode } from './errors.ts';
import type { EmitCtx } from './emitCtx.ts';
import { UNCHECKABLE_KEYWORDS, exprAtoms, phpLiteralFromNode } from './helpers.ts';
import { classStringGenericBoolean } from './classString.ts';
import { keywordToBoolean } from './keywordBoolean.ts';

export function booleanAtoms(
  ctx: EmitCtx,
  type: TypeNode,
  subject: ValueRef,
): readonly Expr[] {
  if (type.kind === 'keyword' && type.keyword === 'mixed') {
    return [];
  }
  const single = ctx.booleanForType(type, subject);
  return exprAtoms(single);
}

export function booleanForType(
  ctx: EmitCtx,
  type: TypeNode,
  subject: ValueRef,
): Expr {
  const compact = ctx.compactCollectionTest(type, subject);
  if (compact !== null) {
    return compact;
  }
  return booleanForTypeKind(ctx, type, subject);
}

function booleanForTypeKind(
  ctx: EmitCtx,
  type: TypeNode,
  subject: ValueRef,
): Expr {
  switch (type.kind) {
    case 'keyword':
      return booleanForKeyword(type.keyword, subject);
    case 'named':
      return booleanForNamed(ctx, type, subject);
    case 'literal':
      return booleanForLiteral(type, subject);
    case 'range':
      return booleanForRange(type, subject);
    case 'union':
      return orExpr(
        type.types.map((m) => ctx.booleanForType(m, subject)),
      );
    case 'intersection':
      return andExpr(
        type.types.map((m) => ctx.booleanForType(m, subject)),
      );
    case 'collection':
    case 'shape':
    case 'array':
      cannotBuild(
        type,
        `Cannot generate a runtime check for ${describeNode(type)}: not representable as a single boolean PHP expression`,
      );
      break;
    case 'unsupported':
    case 'callable':
      cannotBuild(type);
      break;
    case 'generic':
      return booleanForGeneric(type, subject);
    default:
      throw new Error('never reached');
  }
  throw new Error('never reached');
}

function booleanForGeneric(
  type: Extract<TypeNode, { kind: 'generic' }>,
  subject: ValueRef,
): Expr {
  const classString = classStringGenericBoolean(type, subject);
  if (classString !== null) {
    return classString;
  }
  return cannotBuild(type);
}

function booleanForKeyword(keyword: Keyword, subject: ValueRef): Expr {
  if (
    keyword === 'literal-string' ||
    keyword === 'non-empty-literal-string'
  ) {
    cannotBuild(
      { kind: 'keyword', keyword },
      'Cannot generate a runtime check for literal-string types: PHP cannot verify PHPStan literal-string semantics at runtime',
    );
  }
  if (UNCHECKABLE_KEYWORDS.has(keyword)) {
    cannotBuild(
      { kind: 'keyword', keyword },
      `Cannot generate a runtime check for the type ${keyword}: this built-in is not supported for codegen`,
    );
  }
  const expr = keywordToBoolean(keyword, subject);
  if (expr === null) {
    cannotBuild({ kind: 'keyword', keyword });
  }
  return expr;
}

function booleanForNamed(
  ctx: EmitCtx,
  node: Extract<TypeNode, { kind: 'named' }>,
  subject: ValueRef,
): Expr {
  const checker = ctx.aliasCheckerByName?.get(node.name);
  if (checker !== undefined) {
    return callCheckerExpr(checker, subject);
  }
  if (node.name === 'closed-resource' || node.name === 'open-resource') {
    cannotBuild(
      node,
      `Cannot generate a runtime check for the type ${node.name}: PHP cannot distinguish open and closed resources at runtime`,
    );
  }
  const s = refArg(subject);
  if (node.name === 'callable-array') {
    return andExpr([callExpr('is_callable', [s]), callExpr('is_array', [s])]);
  }
  if (node.name === 'callable-object') {
    return andExpr([
      callExpr('is_callable', [s]),
      callExpr('is_object', [s]),
    ]);
  }
  if (!isValidPhpClassName(node.name)) {
    cannotBuild(
      node,
      `Cannot generate a runtime check for the type ${node.name}: "${node.name}" is not a valid PHP class name`,
    );
  }
  return instanceofExpr(s, node.name);
}

function booleanForLiteral(
  node: Extract<TypeNode, { kind: 'literal' }>,
  subject: ValueRef,
): Expr {
  if (node.type !== 'string' && node.type !== 'number') {
    cannotBuild(node);
  }
  const lit = phpLiteralFromNode(node);
  if (lit === null) {
    cannotBuild(node);
  }
  return binExpr('===', refArg(subject), literalArg(lit));
}

function booleanForRange(
  node: Extract<TypeNode, { kind: 'range' }>,
  subject: ValueRef,
): Expr {
  const s = refArg(subject);
  const parts: Expr[] = [callExpr('is_int', [s])];
  if (node.min !== null) {
    parts.push(binExpr('>=', s, literalArg(String(node.min))));
  }
  if (node.max !== null) {
    parts.push(binExpr('<=', s, literalArg(String(node.max))));
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return andExpr(parts);
}
