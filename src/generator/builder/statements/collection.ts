import type { TypeNode } from '../../../parser/ast.ts';
import type { Block, ValueRef } from '../../ir/types.ts';
import {
  binExpr,
  boolLit,
  callExpr,
  failIfStmt,
  literalArg,
  refArg,
  variableRef,
  arrayAccessRef,
} from '../../ir/index.ts';
import { cannotBuild } from '../errors.ts';
import { isMixed, isNever } from '../ast/classify.ts';
import { collectionGuardExpr } from '../expr/guard.ts';
import {
  isIterableKeyword,
  isListKeyword,
  isNonEmptyKeyword,
} from '../ast/collection.ts';
import type { Context } from '../context.ts';

export function buildCollection(
  node: Extract<TypeNode, { kind: 'collection' }>,
  subject: ValueRef,
  ctx: Context,
): Block {
  rejectParameterizedIterable(node);

  if (isListKeyword(node.keyword)) {
    return buildListCollection(node, subject, ctx);
  }
  if (isIterableKeyword(node.keyword) && !('key' in node)) {
    return buildIterableCollection(node, subject, ctx);
  }
  if ('values' in node) {
    return buildValuesCollection(node, subject, ctx);
  }
  if ('key' in node) {
    return buildKeyedCollection(node, subject, ctx);
  }
  return buildValueOnlyCollection(node, subject, ctx);
}

export function buildPostfixArray(
  node: Extract<TypeNode, { kind: 'array' }>,
  subject: ValueRef,
  ctx: Context,
): Block {
  if (isNever(node.value)) {
    return [failIfStmt(binExpr('===', refArg(subject), literalArg('[]')))];
  }

  const out: Block = [];
  if (ctx.includeArrayGuard !== false && !ctx.assumeVarIsArray) {
    out.push(failIfStmt(callExpr('is_array', [refArg(subject)])));
  }

  if (isMixed(node.value)) {
    return out;
  }

  const { value: valueVar } = ctx.allocateLoopPair();
  const body = ctx.buildStatements(node.value, variableRef(valueVar), {
    ...ctx,
    includeArrayGuard: true,
    inLoopBody: true,
    iterable: variableRef(valueVar),
  }).filter(
    (s) => !(s.kind === 'return' && s.expr.kind === 'bool' && s.expr.value),
  );

  out.push({
    kind: 'foreach',
    iterable: ctx.iterable ?? subject,
    keyVar: null,
    valueVar,
    body,
  });
  return out;
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

function buildListCollection(
  node: Extract<TypeNode, { kind: 'collection' }>,
  subject: ValueRef,
  ctx: Context,
): Block {
  const nonEmpty = isNonEmptyKeyword(node.keyword);

  if ('values' in node && node.values.length > 1) {
    return buildIndexedValuesCollection(node.values, subject, ctx, {
      nonEmpty,
      listGuards: true,
    });
  }

  const element = 'value' in node
    ? node.value
    : 'values' in node && node.values.length === 1
      ? node.values[0]!
      : { kind: 'keyword', keyword: 'mixed' } as TypeNode;

  if (isNever(element)) {
    if (nonEmpty) {
      return [failIfStmt(boolLit(false))];
    }
    return [
      failIfStmt(
        binExpr('!==', refArg(subject), literalArg('[]')),
      ),
    ];
  }

  const out: Block = [];
  appendListGuards(out, subject, ctx, nonEmpty);

  if (isMixed(element)) {
    return out;
  }

  const { value: valueVar } = ctx.allocateLoopPair();
  const body = ctx.buildStatements(element, variableRef(valueVar), {
    ...ctx,
    includeArrayGuard: true,
    inLoopBody: true,
    iterable: variableRef(valueVar),
  }).filter(
    (s) => !(s.kind === 'return' && s.expr.kind === 'bool' && s.expr.value),
  );

  out.push({
    kind: 'foreach',
    iterable: ctx.iterable ?? subject,
    keyVar: null,
    valueVar,
    body,
  });
  return out;
}

function buildIterableCollection(
  node: Extract<TypeNode, { kind: 'collection' }>,
  subject: ValueRef,
  ctx: Context,
): Block {
  const nonEmpty = isNonEmptyKeyword(node.keyword);
  const out: Block = [];
  if (ctx.includeArrayGuard !== false && !ctx.assumeVarIsArray) {
    out.push(failIfStmt(callExpr('is_iterable', [refArg(subject)])));
  }
  if (nonEmpty) {
    out.push(
      failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
    );
  }
  if ('value' in node && !isMixed(node.value)) {
    const compact = collectionGuardExpr(node, subject);
    if (compact !== null) {
      const atoms = compact.kind === 'and' ? compact.exprs : [compact];
      for (const atom of atoms) {
        out.push(failIfStmt(atom));
      }
    }
  }
  return out;
}

function buildValuesCollection(
  node: Extract<TypeNode, { kind: 'collection'; values: TypeNode[] }>,
  subject: ValueRef,
  ctx: Context,
): Block {
  const nonEmpty = isNonEmptyKeyword(node.keyword);
  return buildIndexedValuesCollection(node.values, subject, ctx, {
    nonEmpty,
    listGuards: false,
  });
}

function buildIndexedValuesCollection(
  values: TypeNode[],
  subject: ValueRef,
  ctx: Context,
  opts: { nonEmpty: boolean; listGuards: boolean },
): Block {
  const out: Block = [];
  if (opts.listGuards) {
    appendListGuards(out, subject, ctx, opts.nonEmpty);
  } else if (ctx.includeArrayGuard !== false && !ctx.assumeVarIsArray) {
    out.push(failIfStmt(callExpr('is_array', [refArg(subject)])));
    if (opts.nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
  }

  const root = valueRefRootBase(subject);
  for (let i = 0; i < values.length; i++) {
    const fieldRef = arrayAccessRef(root, i);
    out.push(
      ...ctx.buildStatements(values[i]!, fieldRef, {
        ...ctx,
        includeArrayGuard: false,
        inShapeField: true,
        iterable: fieldRef,
      }),
    );
  }
  return out;
}

function buildKeyedCollection(
  node: Extract<TypeNode, { kind: 'collection'; key: TypeNode; value: TypeNode }>,
  subject: ValueRef,
  ctx: Context,
): Block {
  return buildKeyedIterable(subject, ctx, node.key, node.value, {
    nonEmpty: isNonEmptyKeyword(node.keyword),
    iterable: false,
  });
}

function buildValueOnlyCollection(
  node: Extract<TypeNode, { kind: 'collection'; value: TypeNode }>,
  subject: ValueRef,
  ctx: Context,
): Block {
  const nonEmpty = isNonEmptyKeyword(node.keyword);
  if (isNever(node.value)) {
    if (nonEmpty) {
      return [failIfStmt(boolLit(false))];
    }
    const emptyCheck = ctx.inShapeField
      ? binExpr('!==', refArg(subject), literalArg('[]'))
      : binExpr('===', refArg(subject), literalArg('[]'));
    return [failIfStmt(emptyCheck)];
  }

  const out: Block = [];

  if (!collectionNeedsLoop(node)) {
    const compact = collectionGuardExpr(node, subject);
    if (compact !== null) {
      const atoms = compact.kind === 'and' ? compact.exprs : [compact];
      for (const atom of atoms) {
        out.push(failIfStmt(atom));
      }
      return out;
    }
  }

  appendArrayGuards(out, subject, ctx, nonEmpty, false);

  if (!collectionNeedsLoop(node)) {
    return out;
  }

  return [
    ...out,
    ...buildKeyedIterable(subject, ctx, null, node.value, {
      nonEmpty,
      iterable: false,
      skipGuards: true,
    }),
  ];
}

function buildKeyedIterable(
  subject: ValueRef,
  ctx: Context,
  key: TypeNode | null,
  value: TypeNode,
  opts: {
    nonEmpty: boolean;
    iterable: boolean;
    skipGuards?: boolean;
  },
): Block {
  const out: Block = [];

  if (!opts.skipGuards) {
    appendArrayGuards(out, subject, ctx, opts.nonEmpty, opts.iterable);
  }

  const bindsKey = Boolean(key && !isMixed(key));
  const { key: keyVar, value: valueVar } = ctx.allocateLoopPair();
  const body: Block = [];
  if (key && !isMixed(key)) {
    body.push(
      ...ctx.buildStatements(key, variableRef(keyVar), {
        ...ctx,
        checkContext: 'expression',
        inLoopBody: true,
      }),
    );
  }
  if (!isMixed(value)) {
    body.push(
      ...ctx.buildStatements(value, variableRef(valueVar), {
        ...ctx,
        includeArrayGuard: true,
        inLoopBody: true,
        iterable: variableRef(valueVar),
      }).filter(
        (s) => !(s.kind === 'return' && s.expr.kind === 'bool' && s.expr.value),
      ),
    );
  }
  out.push({
    kind: 'foreach',
    iterable: ctx.iterable ?? subject,
    keyVar: bindsKey ? keyVar : null,
    valueVar,
    body,
  });
  return out;
}

function collectionNeedsLoop(
  node: Extract<TypeNode, { kind: 'collection'; value: TypeNode }>,
): boolean {
  return !isMixed(node.value);
}

function appendListGuards(
  out: Block,
  subject: ValueRef,
  ctx: Context,
  nonEmpty: boolean,
): void {
  if (ctx.includeArrayGuard === false) {
    if (nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
    return;
  }
  if (ctx.assumeVarIsArray) {
    out.push(failIfStmt(callExpr('array_is_list', [refArg(subject)])));
    if (nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
    return;
  }
  out.push(failIfStmt(callExpr('is_array', [refArg(subject)])));
  out.push(failIfStmt(callExpr('array_is_list', [refArg(subject)])));
  if (nonEmpty) {
    out.push(
      failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
    );
  }
}

function appendArrayGuards(
  out: Block,
  subject: ValueRef,
  ctx: Context,
  nonEmpty: boolean,
  iterable: boolean,
): void {
  const includeGuard = ctx.includeArrayGuard !== false;
  const av = Boolean(ctx.assumeVarIsArray);

  if (includeGuard && av && !iterable) {
    if (nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
    return;
  }
  if (includeGuard) {
    out.push(
      failIfStmt(
        callExpr(iterable ? 'is_iterable' : 'is_array', [refArg(subject)]),
      ),
    );
    if (nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
    return;
  }
  if (nonEmpty) {
    out.push(
      failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
    );
  }
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
