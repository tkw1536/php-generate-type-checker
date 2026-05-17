import type { TypeNode } from '../../parser/ast.ts';
import type { Block, CheckerProgram, Expr, Stmt, ValueRef } from '../ir/types.ts';
import {
  andExpr,
  binExpr,
  boolLit,
  callCheckerExpr,
  callExpr,
  failIfStmt,
  literalArg,
  orExpr,
  refArg,
  returnStmt,
  variableRef,
  arrayAccessRef,
  propertyAccessRef,
} from '../ir/';
import { phpLiteralKey } from './phpLiteral.ts';
import { exprAtomsForType, singleExprForType } from './primitive.ts';
import {
  isExpressible,
  isNeverPrimitive,
  isNoOpValueCheck,
  needsStatementBlock,
} from '../semantics/expressibility.ts';
import {
  bareListKeywordAsCollection,
  isBareListKeyword,
  isIterableKeyword,
  isListKeyword,
  isNonEmptyKeyword,
  shapeIsObject,
} from '../semantics/collection.ts';
import { flattenUnion, sortUnionMembers } from '../semantics/union.ts';

export type BuildContext = {
  parameter: string;
  assumeVarIsArray?: boolean;
  assumeVarIsObject?: boolean;
  includeArrayGuard?: boolean;
  inLoopBody?: boolean;
  inShapeField?: boolean;
  allowReturn?: boolean;
  iterable?: ValueRef;
  resolveCheckerName: (type: TypeNode) => string;
  allocateLoopPair: () => { key: string; value: string };
};

export class Builder {
  build(node: TypeNode, parameter: string, ctx: BuildContext): CheckerProgram {
    const body = this.buildBody(node, variableRef(parameter), {
      ...ctx,
      includeArrayGuard: true,
      assumeVarIsArray: false,
      assumeVarIsObject: false,
    });
    appendTrailingReturn(body);
    return { parameter, body };
  }

  private buildBody(
    node: TypeNode,
    subject: ValueRef,
    ctx: BuildContext,
  ): Block {
    switch (node.kind) {
      case 'union':
        if (ctx.inLoopBody) {
          return [this.nestedUnionStmt(node, subject, ctx)];
        }
        return this.rootUnion(node, subject, ctx);
      case 'intersection':
        return this.intersection(node, subject, ctx);
      case 'collection':
        return this.collection(node, subject, ctx);
      case 'shape':
        return this.shape(node, subject, ctx);
      case 'array':
        return this.postfixArray(node, subject, ctx);
      case 'keyword':
        if (isBareListKeyword(node)) {
          return this.listCollection(
            bareListKeywordAsCollection(node),
            subject,
            ctx,
          );
        }
        return this.leaf(node, subject, ctx);
      default:
        return this.leaf(node, subject, ctx);
    }
  }

  private leaf(node: TypeNode, subject: ValueRef, ctx: BuildContext): Block {
    const out: Block = [];

    if (isNoOpValueCheck(node)) {
      return out;
    }
    if (node.kind === 'union') {
      out.push(this.nestedUnionStmt(node, subject, ctx));
      return out;
    }
    if (needsStatementBlock(node)) {
      return this.buildBody(node, subject, ctx);
    }
    if (
      !ctx.inLoopBody &&
      ctx.allowReturn !== false &&
      typeSupportsReturnPromotion(node, subject)
    ) {
      const expr = singleExprForType(node, subject);
      if (expr) {
        out.push(returnStmt(expr));
        return out;
      }
    }
    for (const atom of exprAtomsForType(node, subject)) {
      out.push(failIfStmt(atom));
    }
    return out;
  }

  private rootUnion(
    node: Extract<TypeNode, { kind: 'union' }>,
    subject: ValueRef,
    ctx: BuildContext,
  ): Block {
    const members = sortUnionMembers(flattenUnion(node));
    if (members.every((m) => isExpressible(m) && !needsStatementBlock(m))) {
      const arms = members.map((m) => singleExprForType(m, subject));
      if (arms.every((a): a is Expr => a !== null)) {
        return [returnStmt(orExpr(arms))];
      }
    }
    const arms: Expr[] = [];
    for (const m of members) {
      const inline = Builder.compactExpr(m, subject);
      if (inline !== null) {
        arms.push(inline);
        continue;
      }
      arms.push(callCheckerExpr(ctx.resolveCheckerName(m), subject));
    }
    return [returnStmt(orExpr(arms))];
  }

  private nestedUnionStmt(
    node: Extract<TypeNode, { kind: 'union' }>,
    subject: ValueRef,
    ctx: BuildContext,
  ): Stmt {
    const members = sortUnionMembers(flattenUnion(node));
    const arms: Expr[] = members.map((m) => {
      const inline = Builder.compactExpr(m, subject);
      if (inline !== null) {
        return inline;
      }
      return callCheckerExpr(ctx.resolveCheckerName(m), subject);
    });
    return failIfStmt(orExpr(arms));
  }

  private intersection(
    node: Extract<TypeNode, { kind: 'intersection' }>,
    subject: ValueRef,
    ctx: BuildContext,
  ): Block {
    const out: Block = [];
    let assumeVarIsArray = Boolean(ctx.assumeVarIsArray);
    let assumeVarIsObject = Boolean(ctx.assumeVarIsObject);
    for (const member of node.types) {
      out.push(
        ...this.buildBody(member, subject, {
          ...ctx,
          assumeVarIsArray,
          assumeVarIsObject,
          includeArrayGuard: true,
        }),
      );
      if (Builder.establishesArray(member)) {
        assumeVarIsArray = true;
      }
      if (Builder.establishesObject(member)) {
        assumeVarIsObject = true;
      }
    }
    return out;
  }

  private collection(
    node: Extract<TypeNode, { kind: 'collection' }>,
    subject: ValueRef,
    ctx: BuildContext,
  ): Block {
    if (isListKeyword(node.keyword)) {
      return this.listCollection(node, subject, ctx);
    }
    if (isIterableKeyword(node.keyword) && !('key' in node)) {
      return this.iterableCollection(node, subject, ctx);
    }
    if ('values' in node) {
      return this.valuesCollection(node, subject, ctx);
    }
    if ('key' in node) {
      return this.keyedCollection(node, subject, ctx);
    }
    return this.valueOnlyCollection(node, subject, ctx);
  }

  private shape(
    node: Extract<TypeNode, { kind: 'shape' }>,
    base: ValueRef,
    ctx: BuildContext,
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
      const isLast = i === node.fields.length - 1;
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

      const fieldBody = this.buildBody(field.value, fieldRef, {
        ...ctx,
        includeArrayGuard: false,
        inShapeField: true,
        iterable: fieldRef,
        allowReturn: isLast,
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

  private listCollection(
    node: Extract<TypeNode, { kind: 'collection' }>,
    subject: ValueRef,
    ctx: BuildContext,
  ): Block {
    const nonEmpty = isNonEmptyKeyword(node.keyword);

    if ('values' in node && node.values.length > 1) {
      return this.indexedValuesCollection(node.values, subject, ctx, {
        nonEmpty,
        listGuards: true,
      });
    }

    const element = 'value' in node
      ? node.value
      : 'values' in node && node.values.length === 1
        ? node.values[0]!
        : { kind: 'keyword', keyword: 'mixed' } as TypeNode;

    if (isNeverPrimitive(element)) {
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
    this.appendListGuards(out, subject, ctx, nonEmpty);

    if (isNoOpValueCheck(element)) {
      return out;
    }

    const { value: valueVar } = ctx.allocateLoopPair();
    const body = this.buildBody(element, variableRef(valueVar), {
      ...ctx,
      includeArrayGuard: true,
      inLoopBody: true,
      iterable: variableRef(valueVar),
    }).filter((s) => !(s.kind === 'return' && s.expr.kind === 'bool' && s.expr.value));

    out.push({
      kind: 'foreach',
      iterable: ctx.iterable ?? subject,
      keyVar: null,
      valueVar,
      body,
    });
    return out;
  }

  private iterableCollection(
    node: Extract<TypeNode, { kind: 'collection' }>,
    subject: ValueRef,
    ctx: BuildContext,
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
    if ('value' in node && !isNoOpValueCheck(node.value)) {
      const compact = Builder.compactExpr(node, subject);
      if (compact !== null) {
        const atoms = compact.kind === 'and' ? compact.exprs : [compact];
        for (const atom of atoms) {
          out.push(failIfStmt(atom));
        }
      }
    }
    return out;
  }

  private valuesCollection(
    node: Extract<TypeNode, { kind: 'collection'; values: TypeNode[] }>,
    subject: ValueRef,
    ctx: BuildContext,
  ): Block {
    const nonEmpty = isNonEmptyKeyword(node.keyword);
    return this.indexedValuesCollection(node.values, subject, ctx, {
      nonEmpty,
      listGuards: false,
    });
  }

  private indexedValuesCollection(
    values: TypeNode[],
    subject: ValueRef,
    ctx: BuildContext,
    opts: { nonEmpty: boolean; listGuards: boolean },
  ): Block {
    const out: Block = [];
    if (opts.listGuards) {
      this.appendListGuards(out, subject, ctx, opts.nonEmpty);
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
      const isLast = i === values.length - 1;
      out.push(
        ...this.buildBody(values[i]!, fieldRef, {
          ...ctx,
          includeArrayGuard: false,
          inShapeField: true,
          iterable: fieldRef,
          allowReturn: isLast,
        }),
      );
    }
    return out;
  }

  private keyedCollection(
    node: Extract<TypeNode, { kind: 'collection'; key: TypeNode; value: TypeNode }>,
    subject: ValueRef,
    ctx: BuildContext,
  ): Block {
    return this.keyedIterable(subject, ctx, node.key, node.value, {
      nonEmpty: isNonEmptyKeyword(node.keyword),
      iterable: false,
    });
  }

  private valueOnlyCollection(
    node: Extract<TypeNode, { kind: 'collection'; value: TypeNode }>,
    subject: ValueRef,
    ctx: BuildContext,
  ): Block {
    const nonEmpty = isNonEmptyKeyword(node.keyword);
    if (isNeverPrimitive(node.value)) {
      if (nonEmpty) {
        return [failIfStmt(boolLit(false))];
      }
      const emptyCheck = ctx.inShapeField
        ? binExpr('!==', refArg(subject), literalArg('[]'))
        : binExpr('===', refArg(subject), literalArg('[]'));
      return [failIfStmt(emptyCheck)];
    }

    const out: Block = [];
    const pseudo: Extract<TypeNode, { kind: 'collection'; value: TypeNode }> = node;

    if (!Builder.collectionNeedsLoop(pseudo)) {
      const compact = Builder.compactExpr(pseudo, subject);
      if (compact !== null) {
        const atoms = compact.kind === 'and' ? compact.exprs : [compact];
        for (const atom of atoms) {
          out.push(failIfStmt(atom));
        }
        return out;
      }
    }

    this.appendArrayGuards(out, subject, ctx, nonEmpty, false);

    if (!Builder.collectionNeedsLoop(pseudo)) {
      return out;
    }

    return [
      ...out,
      ...this.keyedIterable(subject, ctx, null, node.value, {
        nonEmpty,
        iterable: false,
        skipGuards: true,
      }),
    ];
  }

  private keyedIterable(
    subject: ValueRef,
    ctx: BuildContext,
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
      this.appendArrayGuards(out, subject, ctx, opts.nonEmpty, opts.iterable);
    }

    const bindsKey = Boolean(key && !isNoOpValueCheck(key));
    const { key: keyVar, value: valueVar } = ctx.allocateLoopPair();
    const body: Block = [];
    if (key && !isNoOpValueCheck(key)) {
      body.push(...this.leaf(key, variableRef(keyVar), { ...ctx, inLoopBody: true }));
    }
    if (!isNoOpValueCheck(value)) {
      body.push(
        ...this.buildBody(value, variableRef(valueVar), {
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

  private postfixArray(
    node: Extract<TypeNode, { kind: 'array' }>,
    subject: ValueRef,
    ctx: BuildContext,
  ): Block {
    if (isNeverPrimitive(node.value)) {
      return [failIfStmt(binExpr('===', refArg(subject), literalArg('[]')))];
    }

    const out: Block = [];
    if (ctx.includeArrayGuard !== false && !ctx.assumeVarIsArray) {
      out.push(failIfStmt(callExpr('is_array', [refArg(subject)])));
    }

    if (isNoOpValueCheck(node.value)) {
      return out;
    }

    const { value: valueVar } = ctx.allocateLoopPair();
    const body = this.buildBody(node.value, variableRef(valueVar), {
      ...ctx,
      includeArrayGuard: true,
      inLoopBody: true,
      iterable: variableRef(valueVar),
    }).filter((s) => !(s.kind === 'return' && s.expr.kind === 'bool' && s.expr.value));

    out.push({
      kind: 'foreach',
      iterable: ctx.iterable ?? subject,
      keyVar: null,
      valueVar,
      body,
    });
    return out;
  }

  private appendListGuards(
    out: Block,
    subject: ValueRef,
    ctx: BuildContext,
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

  private appendArrayGuards(
    out: Block,
    subject: ValueRef,
    ctx: BuildContext,
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

  private static compactExpr(n: TypeNode, subject: ValueRef): Expr | null {
    if (isBareListKeyword(n)) {
      return Builder.compactExpr(bareListKeywordAsCollection(n), subject);
    }
    if (isNoOpValueCheck(n)) {
      return boolLit(true);
    }
    if (isExpressible(n) && !needsStatementBlock(n)) {
      const direct = singleExprForType(n, subject);
      if (direct !== null) {
        return direct;
      }
    }
    if (n.kind === 'collection') {
      if (isIterableKeyword(n.keyword) && !('key' in n)) {
        const listOk = callExpr('is_iterable', [refArg(subject)]);
        return isNonEmptyKeyword(n.keyword)
          ? andExpr([listOk, binExpr('!==', refArg(subject), literalArg('[]'))])
          : listOk;
      }
      if ('value' in n && !isNeverPrimitive(n.value) && isNoOpValueCheck(n.value)) {
        const guard = isIterableKeyword(n.keyword) ? 'is_iterable' : 'is_array';
        const arrOk = callExpr(guard, [refArg(subject)]);
        return isNonEmptyKeyword(n.keyword)
          ? andExpr([arrOk, binExpr('!==', refArg(subject), literalArg('[]'))])
          : arrOk;
      }
      if (
        'value' in n &&
        isNeverPrimitive(n.value) &&
        !isIterableKeyword(n.keyword)
      ) {
        return isNonEmptyKeyword(n.keyword)
          ? boolLit(false)
          : binExpr('===', refArg(subject), literalArg('[]'));
      }
    }
    if (n.kind === 'collection' && isListKeyword(n.keyword)) {
      const el =
        'value' in n
          ? n.value
          : 'values' in n && n.values.length === 1
            ? n.values[0]
            : null;
      if (el && isNeverPrimitive(el)) {
        return isNonEmptyKeyword(n.keyword)
          ? boolLit(false)
          : binExpr('===', refArg(subject), literalArg('[]'));
      }
      if (el && isNoOpValueCheck(el)) {
        const listOk = andExpr([
          callExpr('is_array', [refArg(subject)]),
          callExpr('array_is_list', [refArg(subject)]),
        ]);
        return isNonEmptyKeyword(n.keyword)
          ? andExpr([listOk, binExpr('!==', refArg(subject), literalArg('[]'))])
          : listOk;
      }
    }
    if (n.kind === 'array' && isNeverPrimitive(n.value)) {
      return binExpr('===', refArg(subject), literalArg('[]'));
    }
    return null;
  }

  private static collectionNeedsLoop(
    node: Extract<TypeNode, { kind: 'collection'; value: TypeNode }>,
  ): boolean {
    return !isNoOpValueCheck(node.value);
  }

  private static establishesObject(member: TypeNode): boolean {
    return member.kind === 'shape' && shapeIsObject(member);
  }

  private static establishesArray(member: TypeNode): boolean {
    if (member.kind === 'shape' && shapeIsObject(member)) {
      return false;
    }
    if (member.kind === 'shape') {
      return true;
    }
    if (isBareListKeyword(member)) {
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
}

/** Root variable name for {@link ValueRef} chains (IR uses a single root base). */
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

function appendTrailingReturn(body: Block): void {
  const last = body[body.length - 1];
  if (last?.kind === 'return') {
    return;
  }
  body.push(returnStmt(boolLit(true)));
}

function typeSupportsReturnPromotion(node: TypeNode, subject: ValueRef): boolean {
  if (isNoOpValueCheck(node) || needsStatementBlock(node) || !isExpressible(node)) {
    return false;
  }
  const atoms = exprAtomsForType(node, subject);
  return atoms.length === 1;
}
