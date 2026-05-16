import type { TypeNode } from '../../parser/ast.ts';
import type { Block, CheckerProgram, Expr, Stmt, ValueRef } from '../ir/types.ts';
import {
  andExpr,
  appendTrailingReturn,
  binExpr,
  boolLit,
  callCheckerExpr,
  callExpr,
  failIfStmt,
  literalArg,
  orExpr,
  refArg,
  returnStmt,
} from '../ir/expr.ts';
import {
  arrayAccessRef,
  propertyAccessRef,
  renderValueRef,
  variableRef,
} from '../ir/refs.ts';
import { phpStringLiteral } from '../render/renderPhp.ts';
import {
  exprAtomsForType,
  parsePhpExprToIr,
  singleExprForType,
} from './primitiveExpr.ts';
import { normalizeNode, type ArrayNode } from '../normalize.ts';
import {
  emitExpression,
  isExpressible,
  isNeverPrimitive,
  isNoOpValueCheck,
  needsStatementBlock,
} from '../simpleTypes.ts';
import { flattenUnion, sortUnionMembers } from '../unionOrder.ts';

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

function subjectFromPath(path: string): ValueRef {
  return variableRef(path);
}

function resolvePathSubject(pathOrSubject: string | ValueRef): {
  path: string;
  subject: ValueRef;
} {
  if (typeof pathOrSubject === 'string') {
    return { path: pathOrSubject, subject: subjectFromPath(pathOrSubject) };
  }
  return { path: renderValueRef(pathOrSubject), subject: pathOrSubject };
}

function typeSupportsReturnPromotion(node: TypeNode, subject: ValueRef): boolean {
  const n = normalizeNode(node);
  if (isNoOpValueCheck(n) || needsStatementBlock(n) || !isExpressible(n)) {
    return false;
  }
  const atoms = exprAtomsForType(n, subject);
  return atoms.length === 1;
}

export class IRBuilder {
  build(node: TypeNode, parameter: string, ctx: BuildContext): CheckerProgram {
    const body = this.buildBody(node, parameter, {
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
    pathOrSubject: string | ValueRef,
    ctx: BuildContext,
  ): Block {
    const n = normalizeNode(node);
    const { path, subject } = resolvePathSubject(pathOrSubject);

    switch (n.kind) {
      case 'union':
        if (ctx.inLoopBody) {
          return [this.nestedUnionStmt(n, subject, ctx)];
        }
        return this.rootUnion(n, path, ctx);
      case 'intersection':
        return this.intersection(n, path, ctx);
      case 'array':
        return this.array(n, path, ctx);
      case 'list':
        return this.list(n, path, ctx);
      case 'shape':
        return this.shape(n, path, ctx);
      default:
        return this.leaf(n, subject, ctx);
    }
  }

  private leaf(node: TypeNode, subject: ValueRef, ctx: BuildContext): Block {
    const n = normalizeNode(node);
    const out: Block = [];

    if (isNoOpValueCheck(n)) {
      return out;
    }
    if (n.kind === 'union') {
      out.push(this.nestedUnionStmt(n, subject, ctx));
      return out;
    }
    if (needsStatementBlock(n)) {
      return this.buildBody(n, subject, ctx);
    }
    if (
      !ctx.inLoopBody &&
      ctx.allowReturn !== false &&
      typeSupportsReturnPromotion(n, subject)
    ) {
      const expr = singleExprForType(n, subject);
      if (expr) {
        out.push(returnStmt(expr));
        return out;
      }
    }
    for (const atom of exprAtomsForType(n, subject)) {
      out.push(failIfStmt(atom));
    }
    return out;
  }

  private rootUnion(
    node: Extract<TypeNode, { kind: 'union' }>,
    parameter: string,
    ctx: BuildContext,
  ): Block {
    const members = sortUnionMembers(flattenUnion(node));
    if (
      members.every((m) => isExpressible(m) && !needsStatementBlock(m))
    ) {
      const expr = emitExpression(node, parameter);
      if (expr !== null) {
        return [returnStmt(parsePhpExprToIr(expr, parameter))];
      }
    }
    const arms: Expr[] = [];
    for (const m of members) {
      const nm = normalizeNode(m);
      const inline = IRBuilder.compactExpr(nm, subjectFromPath(parameter));
      if (inline !== null) {
        arms.push(inline);
        continue;
      }
      arms.push(
        callCheckerExpr(ctx.resolveCheckerName(m), subjectFromPath(parameter)),
      );
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
      const nm = normalizeNode(m);
      const inline = IRBuilder.compactExpr(nm, subject);
      if (inline !== null) {
        return inline;
      }
      return callCheckerExpr(ctx.resolveCheckerName(m), subject);
    });
    return failIfStmt(orExpr(arms));
  }

  private intersection(
    node: Extract<TypeNode, { kind: 'intersection' }>,
    parameter: string,
    ctx: BuildContext,
  ): Block {
    const out: Block = [];
    let assumeVarIsArray = Boolean(ctx.assumeVarIsArray);
    let assumeVarIsObject = Boolean(ctx.assumeVarIsObject);
    for (const raw of node.types) {
      const member = normalizeNode(raw);
      out.push(
        ...this.buildBody(member, parameter, {
          ...ctx,
          assumeVarIsArray,
          assumeVarIsObject,
          includeArrayGuard: true,
        }),
      );
      if (IRBuilder.establishesArray(member)) {
        assumeVarIsArray = true;
      }
      if (IRBuilder.establishesObject(member)) {
        assumeVarIsObject = true;
      }
    }
    return out;
  }

  private shape(node: Extract<TypeNode, { kind: 'shape' }>, parameter: string, ctx: BuildContext): Block {
    const out: Block = [];
    const objectShape = Boolean(node.object);
    const base = variableRef(parameter);

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
        ? propertyAccessRef(parameter, String(field.key))
        : arrayAccessRef(parameter, field.key);
      const keyLit = phpStringLiteral(field.key);

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

      const fieldBody = this.buildBody(field.type, fieldRef, {
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

  private list(
    node: Extract<TypeNode, { kind: 'list' }>,
    parameter: string,
    ctx: BuildContext,
  ): Block {
    const subject = subjectFromPath(parameter);
    if (isNeverPrimitive(node.element)) {
      if (node.nonEmpty) {
        return [failIfStmt(boolLit(false))];
      }
      return [
        failIfStmt(
          binExpr('!==', refArg(subject), literalArg('[]')),
        ),
      ];
    }

    const out: Block = [];
    this.appendListGuards(out, node, subject, ctx);

    if (isNoOpValueCheck(node.element)) {
      return out;
    }

    const { value: valueVar } = ctx.allocateLoopPair();
    const body = this.buildBody(node.element, valueVar, {
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
    node: Extract<TypeNode, { kind: 'list' }>,
    subject: ValueRef,
    ctx: BuildContext,
  ): void {
    if (ctx.includeArrayGuard === false) {
      if (node.nonEmpty) {
        out.push(
          failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
        );
      }
      return;
    }
    if (ctx.assumeVarIsArray) {
      out.push(failIfStmt(callExpr('array_is_list', [refArg(subject)])));
      if (node.nonEmpty) {
        out.push(
          failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
        );
      }
      return;
    }
    out.push(failIfStmt(callExpr('is_array', [refArg(subject)])));
    out.push(failIfStmt(callExpr('array_is_list', [refArg(subject)])));
    if (node.nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
  }

  private array(node: ArrayNode, parameter: string, ctx: BuildContext): Block {
    const subject = subjectFromPath(parameter);
    if (isNeverPrimitive(node.value)) {
      if (node.nonEmpty) {
        return [failIfStmt(boolLit(false))];
      }
      if (!node.iterable) {
        const emptyCheck = ctx.inShapeField
          ? binExpr('!==', refArg(subject), literalArg('[]'))
          : binExpr('===', refArg(subject), literalArg('[]'));
        return [failIfStmt(emptyCheck)];
      }
    }

    const out: Block = [];

    if (!IRBuilder.arrayNeedsLoop(node)) {
      const compact = IRBuilder.compactExpr(node, subject);
      if (compact !== null) {
        const atoms =
          compact.kind === 'and' ? compact.exprs : [compact];
        for (const atom of atoms) {
          out.push(failIfStmt(atom));
        }
        return out;
      }
    }

    this.appendArrayGuards(out, node, subject, ctx);

    if (!IRBuilder.arrayNeedsLoop(node)) {
      return out;
    }

    const { key: keyVar, value: valueVar } = ctx.allocateLoopPair();
    const bindsKey = Boolean(node.key && !isNoOpValueCheck(node.key));
    const body: Block = [];
    if (node.key && !isNoOpValueCheck(node.key)) {
      body.push(...this.leaf(node.key, variableRef(keyVar), { ...ctx, inLoopBody: true }));
    }
    if (!isNoOpValueCheck(node.value)) {
      body.push(
        ...this.buildBody(node.value, valueVar, {
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

  private appendArrayGuards(
    out: Block,
    node: ArrayNode,
    subject: ValueRef,
    ctx: BuildContext,
  ): void {
    const includeGuard = ctx.includeArrayGuard !== false;
    const av = Boolean(ctx.assumeVarIsArray);

    if (includeGuard && av && !node.iterable) {
      if (node.nonEmpty) {
        out.push(
          failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
        );
      }
      return;
    }
    if (includeGuard) {
      out.push(
        failIfStmt(
          callExpr(node.iterable ? 'is_iterable' : 'is_array', [refArg(subject)]),
        ),
      );
      if (node.nonEmpty) {
        out.push(
          failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
        );
      }
      return;
    }
    if (node.nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
  }

  private static compactExpr(n: TypeNode, subject: ValueRef): Expr | null {
    const node = normalizeNode(n);
    const path = renderValueRef(subject);

    if (isNoOpValueCheck(node)) {
      return boolLit(true);
    }
    if (isExpressible(node) && !needsStatementBlock(node)) {
      const expr = emitExpression(node, path);
      if (expr !== null) {
        return parsePhpExprToIr(expr, path);
      }
    }
    if (node.kind === 'array') {
      const an = node as ArrayNode;
      if (IRBuilder.isUnconstrainedArray(an)) {
        const e = an.iterable ? 'is_iterable' : 'is_array';
        return callExpr(e, [refArg(subject)]);
      }
      if (isNeverPrimitive(an.value) && !an.iterable) {
        return an.nonEmpty
          ? boolLit(false)
          : binExpr('===', refArg(subject), literalArg('[]'));
      }
    }
    if (node.kind === 'list' && isNeverPrimitive(node.element)) {
      return node.nonEmpty
        ? boolLit(false)
        : binExpr('===', refArg(subject), literalArg('[]'));
    }
    if (node.kind === 'list' && isNoOpValueCheck(node.element)) {
      const listOk = andExpr([
        callExpr('is_array', [refArg(subject)]),
        callExpr('array_is_list', [refArg(subject)]),
      ]);
      return node.nonEmpty
        ? andExpr([listOk, binExpr('!==', refArg(subject), literalArg('[]'))])
        : listOk;
    }
    return null;
  }

  private static isUnconstrainedArray(node: ArrayNode): boolean {
    if (node.nonEmpty) return false;
    if (node.key && !isNoOpValueCheck(node.key)) return false;
    if (!isNoOpValueCheck(node.value)) return false;
    return true;
  }

  private static arrayNeedsLoop(node: ArrayNode): boolean {
    return Boolean(node.key && !isNoOpValueCheck(node.key)) || !isNoOpValueCheck(node.value);
  }

  private static establishesObject(member: TypeNode): boolean {
    const m = normalizeNode(member);
    return m.kind === 'shape' && Boolean(m.object);
  }

  private static establishesArray(member: TypeNode): boolean {
    const m = normalizeNode(member);
    if (m.kind === 'shape' && m.object) return false;
    if (m.kind === 'shape' || m.kind === 'list') return true;
    if (m.kind === 'array') return !(m as ArrayNode).iterable;
    return false;
  }
}

export function buildProgram(
  node: TypeNode,
  parameter: string,
  ctx: BuildContext,
): CheckerProgram {
  return new IRBuilder().build(node, parameter, ctx);
}
