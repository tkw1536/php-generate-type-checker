import type { TypeNode } from '../../../parser/ast.ts';
import type { Expr, ValueRef } from '../../ir/types.ts';
import {
  andExpr,
  binExpr,
  callExpr,
  instanceofExpr,
  literalArg,
  orExpr,
  refArg,
} from '../../ir/index.ts';
import { isMixed } from '../ast/classify.ts';
import { cannotBuild, describeNode } from '../errors.ts';
import { collectionGuardExpr } from './guard.ts';
import { buildKeywordExpr } from './keywords.ts';
import { phpLiteralFromNode } from './literal.ts';

export function buildExpr(node: TypeNode, subject: ValueRef): Expr {
  const guard = collectionGuardExpr(node, subject);
  if (guard !== null) {
      return guard;
  }

  switch (node.kind) {
    case 'keyword':
      return buildKeywordExpr(node.keyword, subject);
    case 'class':
      return buildClassExpr(node, subject);
    case 'literal':
      return buildLiteralExpr(node, subject);
    case 'range':
      return buildRangeExpr(node, subject);
    case 'union': {
      return orExpr(node.types.map((m) => buildExpr(m, subject)));
    }
    case 'intersection': {
      return andExpr(node.types.map((m) => buildExpr(m, subject)));
    }
    case 'collection':
    case 'shape':
    case 'array':
      cannotBuild(
        node,
        `Cannot generate a runtime check for ${describeNode(node)}: not representable as a single boolean PHP expression`,
      );
    default:
      cannotBuild(node);
  }
}

export function buildExprAtoms(node: TypeNode, subject: ValueRef): Expr[] {
  if (isMixed(node)) {
    return [];
  }
  const single = buildExpr(node, subject);
  if (single.kind === 'and') {
    return single.exprs;
  }
  return [single];
}

function buildClassExpr(
  node: Extract<TypeNode, { kind: 'class' }>,
  subject: ValueRef,
): Expr {
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
    return andExpr([callExpr('is_callable', [s]), callExpr('is_object', [s])]);
  }
  return instanceofExpr(s, node.name);
}

function buildLiteralExpr(
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

function buildRangeExpr(
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
    return parts[0]!;
  }
  return andExpr(parts);
}
