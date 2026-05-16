import type { TypeNode } from '../../parser/ast.ts';
import {
  type CheckerProgram,
  type CheckerStmt,
  type OrArm,
  type ValueRef,
  arrayIndexRef,
  objectPropertyRef,
  loopValueRef,
  parameterRef,
  valueRefToPath,
} from '../checkerIR.ts';
import {
  checkForReturnIf,
  checksForType,
  expressionToChecks,
  expressionToMatchArms,
} from './checksFromType.ts';
import { normalizeNode, type ArrayNode } from '../normalize.ts';
import {
  emitExpression,
  isExpressible,
  isNeverPrimitive,
  isNoOpValueCheck,
  needsStatementBlock,
} from '../simpleTypes.ts';
import { flattenUnion, sortUnionMembers } from '../unionOrder.ts';

/** Whether an expressible leaf can use `returnIf` instead of `failIf` (shape field tails). */
function typeSupportsReturnIfPromotion(
  node: TypeNode,
  variable: string,
): boolean {
  const n = normalizeNode(node);
  if (isNoOpValueCheck(n)) {
    return false;
  }
  if (needsStatementBlock(n)) {
    return false;
  }
  if (!isExpressible(n)) {
    return false;
  }
  return checkForReturnIf(n, variable) !== null;
}

export type BuildCheckerContext = {
  parameter: string;
  assumeVarIsArray?: boolean;
  assumeVarIsObject?: boolean;
  includeArrayGuard?: boolean;
  /** When true, expressible types emit `failIf` instead of `returnIf` (inside foreach). */
  inLoopBody?: boolean;
  /** When false, never emit `returnIf` for expressible leaves (non-terminal shape fields). */
  allowReturnIf?: boolean;
  /** Container iterated by `foreach` (defaults to the parameter). */
  iterableRef?: ValueRef;
  resolveCheckerFunction: (type: TypeNode) => string;
  nextLoopId: () => string;
  allocateLoopPair: () => { key: string; value: string };
};

export class CheckerIRBuilder {
  build(node: TypeNode, parameter: string, ctx: BuildCheckerContext): CheckerProgram {
    const statements = this.buildStatementsForType(node, parameter, {
      ...ctx,
      includeArrayGuard: true,
      assumeVarIsArray: false,
      assumeVarIsObject: false,
    });
    CheckerIRBuilder.appendTrailingReturn(statements);
    return { parameter, statements };
  }

  private static appendTrailingReturn(statements: CheckerStmt[]): void {
    const last = statements[statements.length - 1];
    if (
      last?.kind === 'returnIf' ||
      last?.kind === 'returnOr' ||
      last?.kind === 'returnTrue'
    ) {
      return;
    }
    statements.push({ kind: 'returnTrue' });
  }

  private buildStatementsForType(
    node: TypeNode,
    variable: string,
    ctx: BuildCheckerContext,
  ): CheckerStmt[] {
    const n = normalizeNode(node);

    switch (n.kind) {
      case 'union':
        if (ctx.inLoopBody) {
          return [this.buildNestedUnionStmt(n, variable, ctx)];
        }
        return this.buildRootUnion(n, variable, ctx);
      case 'intersection':
        return this.buildIntersection(n, variable, ctx);
      case 'array':
        return this.buildArray(n, variable, ctx);
      case 'list':
        return this.buildList(n, variable, ctx);
      case 'shape':
        return this.buildShape(n, variable, ctx);
      default:
        return this.buildLeafStatements(n, variable, ctx);
    }
  }

  private buildLeafStatements(
    node: TypeNode,
    variable: string,
    ctx: BuildCheckerContext,
  ): CheckerStmt[] {
    const n = normalizeNode(node);
    const stmts: CheckerStmt[] = [];
    if (isNoOpValueCheck(n)) {
      return stmts;
    }
    if (n.kind === 'union') {
      stmts.push(this.buildNestedUnionStmt(n, variable, ctx));
      return stmts;
    }
    if (needsStatementBlock(n)) {
      return this.buildStatementsForType(n, variable, {
        ...ctx,
        includeArrayGuard: true,
      });
    }
    if (
      !ctx.inLoopBody &&
      ctx.allowReturnIf !== false &&
      typeSupportsReturnIfPromotion(n, variable)
    ) {
      const check = checkForReturnIf(n, variable);
      if (check) {
        stmts.push({ kind: 'returnIf', check });
        return stmts;
      }
    }
    for (const check of checksForType(n, variable, { forFailIf: true })) {
      stmts.push({ kind: 'failIf', check });
    }
    return stmts;
  }

  private buildRootUnion(
    node: Extract<TypeNode, { kind: 'union' }>,
    parameter: string,
    ctx: BuildCheckerContext,
  ): CheckerStmt[] {
    const members = sortUnionMembers(flattenUnion(node));
    const arms: OrArm[] = [];
    for (const m of members) {
      const nm = normalizeNode(m);
      const inline = CheckerIRBuilder.compactTypeCheckExpression(nm, parameter);
      if (inline !== null) {
        const matchArms = expressionToMatchArms(inline, parameter);
        if (matchArms.length === 1) {
          arms.push({ kind: 'check', check: matchArms[0]! });
          continue;
        }
      }
      arms.push({
        kind: 'checkerCall',
        typeKey: '',
        callExpression: `${ctx.resolveCheckerFunction(m)}(${parameter})`,
      });
    }
    return [{ kind: 'returnOr', arms }];
  }

  private buildNestedUnionStmt(
    node: Extract<TypeNode, { kind: 'union' }>,
    variable: string,
    ctx: BuildCheckerContext,
  ): CheckerStmt {
    const members = sortUnionMembers(flattenUnion(node));
    const arms = members.flatMap((m) => {
      const nm = normalizeNode(m);
      const inline = CheckerIRBuilder.compactTypeCheckExpression(nm, variable);
      if (inline !== null) {
        return expressionToMatchArms(inline, variable);
      }
      return [
        {
          kind: 'call' as const,
          function: '',
          arguments: [`${ctx.resolveCheckerFunction(m)}(${variable})`],
          negated: false,
        },
      ];
    });
    return { kind: 'failUnlessMatch', arms };
  }

  private buildIntersection(
    node: Extract<TypeNode, { kind: 'intersection' }>,
    parameter: string,
    ctx: BuildCheckerContext,
  ): CheckerStmt[] {
    const out: CheckerStmt[] = [];
    let assumeVarIsArray = Boolean(ctx.assumeVarIsArray);
    let assumeVarIsObject = Boolean(ctx.assumeVarIsObject);
    for (const raw of node.types) {
      const member = normalizeNode(raw);
      out.push(
        ...this.buildStatementsForType(member, parameter, {
          ...ctx,
          assumeVarIsArray,
          assumeVarIsObject,
          includeArrayGuard: true,
        }),
      );
      if (CheckerIRBuilder.intersectionMemberEstablishesPhpArray(member)) {
        assumeVarIsArray = true;
      }
      if (CheckerIRBuilder.intersectionMemberEstablishesPhpObject(member)) {
        assumeVarIsObject = true;
      }
    }
    return out;
  }

  private buildShape(
    node: Extract<TypeNode, { kind: 'shape' }>,
    parameter: string,
    ctx: BuildCheckerContext,
  ): CheckerStmt[] {
    const stmts: CheckerStmt[] = [];
    const objectShape = Boolean(node.object);
    const baseRef = parameterRef();

    if (ctx.includeArrayGuard !== false) {
      if (objectShape) {
        if (!ctx.assumeVarIsObject) {
          stmts.push(CheckerIRBuilder.failCall('is_object', [parameter]));
        }
      } else if (!ctx.assumeVarIsArray) {
        stmts.push(CheckerIRBuilder.failCall('is_array', [parameter]));
      }
    }

    const fields = node.fields;
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]!;
      const isLast = i === fields.length - 1;
      const fieldRef = objectShape
        ? objectPropertyRef(baseRef, field.key)
        : arrayIndexRef(baseRef, field.key);
      const fieldPath = valueRefToPath(fieldRef, parameter, new Map());
      const keyLit = CheckerIRBuilder.phpStringLiteral(field.key);

      if (!field.optional) {
        if (objectShape) {
          stmts.push(CheckerIRBuilder.failCall('property_exists', [parameter, keyLit]));
        } else {
          stmts.push(CheckerIRBuilder.failCall('array_key_exists', [keyLit, parameter]));
        }
      }

      if (field.optional) {
        stmts.push({
          kind: 'optional',
          ref: baseRef,
          key: field.key,
          objectShape,
          body: this.buildFieldBody(field.type, fieldPath, fieldRef, ctx, isLast),
        });
      } else {
        stmts.push(
          ...this.buildFieldBody(field.type, fieldPath, fieldRef, ctx, isLast),
        );
      }
    }
    return stmts;
  }

  private buildFieldBody(
    type: TypeNode,
    fieldPath: string,
    fieldRef: ValueRef,
    ctx: BuildCheckerContext,
    isLast: boolean,
  ): CheckerStmt[] {
    return this.buildStatementsForType(type, fieldPath, {
      ...ctx,
      includeArrayGuard: false,
      iterableRef: fieldRef,
      allowReturnIf: isLast,
    });
  }

  private buildList(
    node: Extract<TypeNode, { kind: 'list' }>,
    parameter: string,
    ctx: BuildCheckerContext,
  ): CheckerStmt[] {
    if (isNeverPrimitive(node.element)) {
      if (node.nonEmpty) {
        return [
          {
            kind: 'failIf',
            check: { kind: 'call', function: '', arguments: ['false'], negated: false },
          },
        ];
      }
      return [
        {
          kind: 'failIf',
          check: { kind: 'equals', variable: parameter, literal: '[]', negated: false },
        },
      ];
    }

    const stmts: CheckerStmt[] = [];
    this.appendListGuards(stmts, node, parameter, ctx);

    if (isNoOpValueCheck(node.element)) {
      return stmts;
    }

    const loopId = ctx.nextLoopId();
    const { value: valueVar } = ctx.allocateLoopPair();
    const body = this.buildStatementsForType(node.element, valueVar, {
      ...ctx,
      includeArrayGuard: true,
      inLoopBody: true,
      iterableRef: loopValueRef(loopId),
    }).filter((s) => s.kind !== 'returnTrue');
    stmts.push({
      kind: 'foreach',
      iterable: ctx.iterableRef ?? parameterRef(),
      loopId,
      keyVar: null,
      valueVar,
      body,
    });
    return stmts;
  }

  private appendListGuards(
    stmts: CheckerStmt[],
    node: Extract<TypeNode, { kind: 'list' }>,
    parameter: string,
    ctx: BuildCheckerContext,
  ): void {
    if (ctx.includeArrayGuard === false) {
      if (node.nonEmpty) {
        stmts.push(CheckerIRBuilder.failEquals(parameter, '[]', false));
      }
      return;
    }
    if (ctx.assumeVarIsArray) {
      stmts.push(CheckerIRBuilder.failCall('array_is_list', [parameter]));
      if (node.nonEmpty) {
        stmts.push(CheckerIRBuilder.failEquals(parameter, '[]', false));
      }
      return;
    }
    stmts.push(CheckerIRBuilder.failCall('is_array', [parameter]));
    stmts.push(CheckerIRBuilder.failCall('array_is_list', [parameter]));
    if (node.nonEmpty) {
      stmts.push(CheckerIRBuilder.failEquals(parameter, '[]', false));
    }
  }

  private buildArray(
    node: ArrayNode,
    parameter: string,
    ctx: BuildCheckerContext,
  ): CheckerStmt[] {
    if (isNeverPrimitive(node.value)) {
      if (node.nonEmpty) {
        return [
          {
            kind: 'failIf',
            check: { kind: 'call', function: '', arguments: ['false'], negated: false },
          },
        ];
      }
      if (!node.iterable) {
        return [CheckerIRBuilder.failEquals(parameter, '[]', true)];
      }
    }

    const stmts: CheckerStmt[] = [];

    if (!CheckerIRBuilder.arrayLoopNeedsElementIteration(node)) {
      const compact = CheckerIRBuilder.compactTypeCheckExpression(node, parameter);
      if (compact !== null) {
        for (const check of expressionToChecks(compact, parameter, { forFailIf: true })) {
          stmts.push({ kind: 'failIf', check });
        }
        return stmts;
      }
    }

    this.appendArrayGuards(stmts, node, parameter, ctx);

    if (!CheckerIRBuilder.arrayLoopNeedsElementIteration(node)) {
      return stmts;
    }

    const loopId = ctx.nextLoopId();
    const { key: keyVar, value: valueVar } = ctx.allocateLoopPair();
    const bindsKey = CheckerIRBuilder.arrayLoopBindsKey(node);
    const body: CheckerStmt[] = [];
    if (node.key && !isNoOpValueCheck(node.key)) {
      body.push(...this.buildLeafStatements(node.key, keyVar, { ...ctx, inLoopBody: true }));
    }
    if (!isNoOpValueCheck(node.value)) {
      body.push(
        ...this.buildStatementsForType(node.value, valueVar, {
          ...ctx,
          includeArrayGuard: true,
          inLoopBody: true,
          iterableRef: loopValueRef(loopId),
        }).filter((s) => s.kind !== 'returnTrue'),
      );
    }
    stmts.push({
      kind: 'foreach',
      iterable: ctx.iterableRef ?? parameterRef(),
      loopId,
      keyVar: bindsKey ? keyVar : null,
      valueVar,
      body,
    });
    return stmts;
  }

  private appendArrayGuards(
    stmts: CheckerStmt[],
    node: ArrayNode,
    parameter: string,
    ctx: BuildCheckerContext,
  ): void {
    const includeGuard = ctx.includeArrayGuard !== false;
    const av = Boolean(ctx.assumeVarIsArray);

    if (includeGuard && av && !node.iterable) {
      if (node.nonEmpty) {
        stmts.push(CheckerIRBuilder.failEquals(parameter, '[]', false));
      }
      return;
    }
    if (includeGuard) {
      stmts.push(CheckerIRBuilder.failCall(node.iterable ? 'is_iterable' : 'is_array', [parameter]));
      if (node.nonEmpty) {
        stmts.push(CheckerIRBuilder.failEquals(parameter, '[]', false));
      }
      return;
    }
    if (node.nonEmpty) {
      stmts.push(CheckerIRBuilder.failEquals(parameter, '[]', false));
    }
  }

  private static failCall(fn: string, args: string[]) {
    return {
      kind: 'failIf' as const,
      check: {
        kind: 'call' as const,
        function: fn,
        arguments: args,
        negated: true,
      },
    };
  }

  private static failEquals(variable: string, literal: string, negated: boolean) {
    return {
      kind: 'failIf' as const,
      check: {
        kind: 'equals' as const,
        variable,
        literal,
        negated,
      },
    };
  }

  private static arrayLoopBindsKey(node: ArrayNode): boolean {
    return Boolean(node.key && !isNoOpValueCheck(node.key));
  }

  private static arrayLoopNeedsElementIteration(node: ArrayNode): boolean {
    return CheckerIRBuilder.arrayLoopBindsKey(node) || !isNoOpValueCheck(node.value);
  }

  private static compactTypeCheckExpression(n: TypeNode, varName: string): string | null {
    const node = normalizeNode(n);
    if (isNoOpValueCheck(node)) {
      return 'true';
    }
    if (isExpressible(node) && !needsStatementBlock(node)) {
      return emitExpression(node, varName);
    }
    if (node.kind === 'array') {
      const an = node as ArrayNode;
      if (CheckerIRBuilder.isUnconstrainedArray(an)) {
        return an.iterable ? `is_iterable(${varName})` : `is_array(${varName})`;
      }
      if (isNeverPrimitive(an.value) && !an.iterable) {
        return an.nonEmpty ? 'false' : `${varName} === []`;
      }
    }
    if (node.kind === 'list' && isNeverPrimitive(node.element)) {
      return node.nonEmpty ? 'false' : `${varName} === []`;
    }
    if (node.kind === 'list' && isNoOpValueCheck(node.element)) {
      const listOk = `is_array(${varName}) && array_is_list(${varName})`;
      return node.nonEmpty ? `${listOk} && ${varName} !== []` : listOk;
    }
    return null;
  }

  private static isUnconstrainedArray(node: ArrayNode): boolean {
    if (node.nonEmpty) return false;
    if (node.key && !isNoOpValueCheck(node.key)) return false;
    if (!isNoOpValueCheck(node.value)) return false;
    return true;
  }

  private static intersectionMemberEstablishesPhpObject(member: TypeNode): boolean {
    const m = normalizeNode(member);
    return m.kind === 'shape' && Boolean(m.object);
  }

  private static intersectionMemberEstablishesPhpArray(member: TypeNode): boolean {
    const m = normalizeNode(member);
    if (m.kind === 'shape' && m.object) return false;
    if (m.kind === 'shape' || m.kind === 'list') return true;
    if (m.kind === 'array') return !(m as ArrayNode).iterable;
    return false;
  }

  private static phpStringLiteral(key: string | number): string {
    if (typeof key === 'number') return String(key);
    return `'${String(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
}

export function buildCheckerIR(
  node: TypeNode,
  parameter: string,
  ctx: BuildCheckerContext,
): CheckerProgram {
  return new CheckerIRBuilder().build(node, parameter, ctx);
}
