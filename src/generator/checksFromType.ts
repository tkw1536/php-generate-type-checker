import type { TypeNode } from '../parser/ast.ts';
import type { Check, CheckCall, CheckEquals } from './checkerIR.ts';
import { instanceofCheck } from './checkerIR.ts';
import {
  emitExpression as emitLeafExpression,
  emitIntRangeExpression,
  isNoOpValueCheck,
} from './simpleTypes.ts';
import { normalizeNode } from './normalize.ts';
import { stripRedundantOuterParens } from './negateExpression.ts';

export type ChecksFromTypeContext = {
  /** When true, atoms are shaped for `failIf` (negated guards). */
  forFailIf: boolean;
};

export class TypeCheckDecomposer {
  private readonly forFailIf: boolean;

  private constructor(forFailIf: boolean) {
    this.forFailIf = forFailIf;
  }

  static forFailIf(): TypeCheckDecomposer {
    return new TypeCheckDecomposer(true);
  }

  static forMatchArms(): TypeCheckDecomposer {
    return new TypeCheckDecomposer(false);
  }

  checksForType(node: TypeNode, variable: string): Check[] {
    const n = normalizeNode(node);

    if (isNoOpValueCheck(n)) {
      return [];
    }

    if (n.kind === 'class') {
      return [this.adjustPolarity(instanceofCheck(variable, n.name, true))];
    }

    if (n.kind === 'literal') {
      const lit = literalPhp(n.value);
      if (lit === null) {
        return [];
      }
      return [this.equalsCheck(variable, lit, false)];
    }

    if (n.kind === 'int_range') {
      return this.expressionToChecks(emitIntRangeExpression(n, variable), variable);
    }

    const expr = emitLeafExpression(n, variable);
    if (expr === null || expr === 'true') {
      return [];
    }
    if (expr === 'false') {
      return [
        this.adjustPolarity({
          kind: 'equals',
          variable: 'true',
          literal: 'true',
          negated: false,
        }),
      ];
    }
    return this.expressionToChecks(expr, variable);
  }

  expressionToChecks(expr: string, variable: string): Check[] {
    const e = stripRedundantOuterParens(expr);
    const andParts = splitTopLevel(e, '&&');
    if (andParts.length > 1) {
      return andParts.flatMap((part) =>
        this.expressionToChecks(part.trim(), variable),
      );
    }
    const single = this.expressionPartToCheck(e);
    return single ? [single] : [this.callCheck('', [e], true)];
  }

  expressionToMatchArms(expr: string, variable: string): Check[] {
    const e = stripRedundantOuterParens(expr);
    const orParts = splitTopLevel(e, '||');
    if (orParts.length > 1) {
      return orParts.map((part) => {
        const decomposer = TypeCheckDecomposer.forMatchArms();
        const checks = decomposer.expressionToChecks(part.trim(), variable);
        if (checks.length === 1) {
          return { ...checks[0]!, negated: false };
        }
        return decomposer.callCheck(
          '',
          [stripRedundantOuterParens(part.trim())],
          false,
        );
      });
    }
    const checks = TypeCheckDecomposer.forMatchArms().expressionToChecks(e, variable);
    if (checks.length === 1) {
      return [{ ...checks[0]!, negated: false }];
    }
    return [TypeCheckDecomposer.forMatchArms().callCheck('', [e], false)];
  }

  private adjustPolarity(check: Check): Check {
    if (!this.forFailIf) {
      return { ...check, negated: !check.negated };
    }
    return check;
  }

  private callCheck(fn: string, args: string[], negated = true): CheckCall {
    return this.adjustPolarity({
      kind: 'call',
      function: fn,
      arguments: args,
      negated,
    }) as CheckCall;
  }

  private equalsCheck(variable: string, literal: string, negated: boolean): CheckEquals {
    return this.adjustPolarity({
      kind: 'equals',
      variable,
      literal,
      negated,
    }) as CheckEquals;
  }

  private expressionPartToCheck(part: string): Check | null {
    const p = stripRedundantOuterParens(part);

    const isFull = /^(is_[a-z_]+)\((.+)\)$/.exec(p);
    if (isFull) {
      return this.callCheck(isFull[1]!, [isFull[2]!], true);
    }

    const arrayKey = /^array_key_exists\((.+),\s*(.+)\)$/.exec(p);
    if (arrayKey) {
      return this.callCheck('array_key_exists', [arrayKey[1]!, arrayKey[2]!], true);
    }

    const propExists = /^property_exists\((.+),\s*(.+)\)$/.exec(p);
    if (propExists) {
      return this.callCheck('property_exists', [propExists[1]!, propExists[2]!], true);
    }

    const instance = /^(.+?)\s+instanceof\s+([\\\w][\w\\]*)$/.exec(p);
    if (instance) {
      return this.adjustPolarity(
        instanceofCheck(instance[1]!.trim(), instance[2]!.trim(), true),
      );
    }

    const eq = /^(.+?)\s===\s(.+)$/.exec(p);
    if (eq) {
      return this.equalsCheck(eq[1]!.trim(), eq[2]!.trim(), false);
    }

    const neqEmpty = /^(.+?)\s!==\s(\[\])$/.exec(p);
    if (neqEmpty) {
      return this.equalsCheck(neqEmpty[1]!.trim(), '[]', true);
    }

    const neq = /^(.+?)\s!==\s('(?:\\'|[^'])*'|-?\d+(?:\.\d+)?|null|true|false)$/.exec(p);
    if (neq) {
      return this.equalsCheck(neq[1]!.trim(), neq[2]!.trim(), true);
    }

    const cmp = /^(.+?)\s(>=|<=|>|<)\s(.+)$/.exec(p);
    if (cmp) {
      return this.callCheck('', [`${cmp[1]!.trim()} ${cmp[2]} ${cmp[3]!.trim()}`], true);
    }

    const fnCall = /^([a-z_][a-z0-9_]*)\((.+)\)$/i.exec(p);
    if (fnCall && !fnCall[1]!.startsWith('is_')) {
      return this.callCheck(fnCall[1]!, splitTopLevelArgs(fnCall[2]!), true);
    }

    return null;
  }
}

function literalPhp(value: string | number | boolean): string | null {
  if (typeof value === 'string') {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return null;
}

function splitTopLevelArgs(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(inner.slice(start).trim());
  return parts.filter(Boolean);
}

function splitTopLevel(expr: string, op: '&&' | '||'): string[] {
  const token = ` ${op} `;
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && expr.startsWith(token, i)) {
      parts.push(expr.slice(start, i));
      start = i + token.length;
      i = start - 1;
    }
  }
  parts.push(expr.slice(start));
  return parts.length > 1 ? parts : [expr];
}

export function checksForType(
  node: TypeNode,
  variable: string,
  ctx: ChecksFromTypeContext,
): Check[] {
  const decomposer = ctx.forFailIf
    ? TypeCheckDecomposer.forFailIf()
    : TypeCheckDecomposer.forMatchArms();
  return decomposer.checksForType(node, variable);
}

export function expressionToChecks(
  expr: string,
  variable: string,
  ctx: ChecksFromTypeContext,
): Check[] {
  const decomposer = ctx.forFailIf
    ? TypeCheckDecomposer.forFailIf()
    : TypeCheckDecomposer.forMatchArms();
  return decomposer.expressionToChecks(expr, variable);
}

export function expressionToMatchArms(expr: string, variable: string): Check[] {
  return TypeCheckDecomposer.forMatchArms().expressionToMatchArms(expr, variable);
}

/** Build a single returnIf check from an expressible type. */
export function checkForReturnIf(node: TypeNode, variable: string): Check | null {
  const checks = TypeCheckDecomposer.forMatchArms().checksForType(node, variable);
  if (checks.length !== 1) {
    return null;
  }
  return { ...checks[0]!, negated: false };
}
