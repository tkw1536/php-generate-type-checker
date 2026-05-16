import type { TypeNode } from '../../parser/ast.ts';
import type { Arg, Expr, ValueRef } from '../ir/types.ts';
import {
  andExpr,
  binExpr,
  boolLit,
  callArg,
  callExpr,
  instanceofExpr,
  literalArg,
  orExpr,
  refArg,
} from '../ir/index.ts';
import { normalizeNode } from '../normalize.ts';
import { stripRedundantOuterParens } from '../negateExpression.ts';

function subjectArg(subject: ValueRef): Arg {
  return refArg(subject);
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

function parsePhpLiteral(token: string): string {
  return token.trim();
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

/** Parse a PHP boolean subexpression into IR using the subject lvalue path. */
function parsePartToExpr(part: string, subjectPath: string): Expr | null {
  const p = stripRedundantOuterParens(part);

  const isFull = /^(is_[a-z_]+)\((.+)\)$/.exec(p);
  if (isFull) {
    return callExpr(isFull[1]!, [literalArg(isFull[2]!)]);
  }

  const arrayKey = /^array_key_exists\((.+),\s*(.+)\)$/.exec(p);
  if (arrayKey) {
    return callExpr('array_key_exists', [
      literalArg(parsePhpLiteral(arrayKey[1]!)),
      literalArg(parsePhpLiteral(arrayKey[2]!)),
    ]);
  }

  const propExists = /^property_exists\((.+),\s*(.+)\)$/.exec(p);
  if (propExists) {
    return callExpr('property_exists', [
      literalArg(parsePhpLiteral(propExists[1]!)),
      literalArg(parsePhpLiteral(propExists[2]!)),
    ]);
  }

  const instance = /^(.+?)\s+instanceof\s+([\\\w][\w\\]*)$/.exec(p);
  if (instance) {
    return instanceofExpr(literalArg(instance[1]!.trim()), instance[2]!.trim());
  }

  const eq = /^(.+?)\s===\s(.+)$/.exec(p);
  if (eq) {
    return binExpr('===', literalArg(eq[1]!.trim()), literalArg(eq[2]!.trim()));
  }

  const neq = /^(.+?)\s!==\s(.+)$/.exec(p);
  if (neq) {
    return binExpr('!==', literalArg(neq[1]!.trim()), literalArg(neq[2]!.trim()));
  }

  const neqLoose = /^(.+?)\s!=\s(.+)$/.exec(p);
  if (neqLoose) {
    return binExpr('!=', literalArg(neqLoose[1]!.trim()), literalArg(neqLoose[2]!.trim()));
  }

  const eqLoose = /^(.+?)\s==\s(.+)$/.exec(p);
  if (eqLoose) {
    return binExpr('==', literalArg(eqLoose[1]!.trim()), literalArg(eqLoose[2]!.trim()));
  }

  const cmp = /^(.+?)\s(>=|<=|>|<)\s(.+)$/.exec(p);
  if (cmp) {
    return binExpr(
      cmp[2] as '>' | '<' | '>=' | '<=',
      literalArg(cmp[1]!.trim()),
      literalArg(cmp[3]!.trim()),
    );
  }

  const fnCall = /^([a-z_][a-z0-9_]*)\((.+)\)$/i.exec(p);
  if (fnCall) {
    const args = splitTopLevelArgs(fnCall[2]!).map((a) => literalArg(a));
    return callExpr(fnCall[1]!, args);
  }

  if (p === 'true') return boolLit(true);
  if (p === 'false') return boolLit(false);

  if (p === subjectPath) {
    return boolLit(true);
  }

  return null;
}

function parseExpressionToExpr(expr: string, subjectPath: string): Expr {
  const e = stripRedundantOuterParens(expr);
  const andParts = splitTopLevel(e, '&&');
  if (andParts.length > 1) {
    return andExpr(
      andParts.map((part) => parseExpressionToExpr(part.trim(), subjectPath)),
    );
  }
  const orParts = splitTopLevel(e, '||');
  if (orParts.length > 1) {
    return orExpr(
      orParts.map((part) => parseExpressionToExpr(part.trim(), subjectPath)),
    );
  }
  const single = parsePartToExpr(e, subjectPath);
  if (single) {
    return single;
  }
  return callExpr('', [literalArg(e)]);
}

function primitiveToExpr(name: string, subject: ValueRef): Expr | null {
  const s = subjectArg(subject);

  switch (name) {
    case 'int':
    case 'integer':
      return callExpr('is_int', [s]);
    case 'string':
      return callExpr('is_string', [s]);
    case 'float':
    case 'double':
      return callExpr('is_float', [s]);
    case 'number':
    case 'numeric':
      return orExpr([callExpr('is_int', [s]), callExpr('is_float', [s])]);
    case 'bool':
    case 'boolean':
      return callExpr('is_bool', [s]);
    case 'scalar':
      return callExpr('is_scalar', [s]);
    case 'empty-scalar':
      return andExpr([
        callExpr('is_scalar', [s]),
        binExpr('==', s, literalArg('false')),
      ]);
    case 'non-empty-scalar':
      return andExpr([
        callExpr('is_scalar', [s]),
        binExpr('!=', s, literalArg('false')),
      ]);
    case 'null':
      return binExpr('===', s, literalArg('null'));
    case 'array':
      return callExpr('is_array', [s]);
    case 'iterable':
      return callExpr('is_iterable', [s]);
    case 'object':
      return callExpr('is_object', [s]);
    case 'resource':
      return callExpr('is_resource', [s]);
    case 'mixed':
      return null;
    case 'never':
    case 'noreturn':
    case 'never-return':
    case 'never-returns':
    case 'no-return':
      return boolLit(false);
    case 'true':
      return binExpr('===', s, literalArg('true'));
    case 'false':
      return binExpr('===', s, literalArg('false'));
    case 'callable':
      return callExpr('is_callable', [s]);
    case 'callable-object':
      return andExpr([
        callExpr('is_object', [s]),
        callExpr('is_callable', [s]),
      ]);
    case 'callable-array':
      return andExpr([
        callExpr('is_array', [s]),
        callExpr('is_callable', [s]),
      ]);
    case 'array-key':
      return orExpr([callExpr('is_string', [s]), callExpr('is_int', [s])]);
    case 'positive-int':
      return andExpr([
        callExpr('is_int', [s]),
        binExpr('>', s, literalArg('0')),
      ]);
    case 'negative-int':
      return andExpr([
        callExpr('is_int', [s]),
        binExpr('<', s, literalArg('0')),
      ]);
    case 'non-positive-int':
      return andExpr([
        callExpr('is_int', [s]),
        binExpr('<=', s, literalArg('0')),
      ]);
    case 'non-negative-int':
      return andExpr([
        callExpr('is_int', [s]),
        binExpr('>=', s, literalArg('0')),
      ]);
    case 'non-zero-int':
      return andExpr([
        callExpr('is_int', [s]),
        binExpr('!==', s, literalArg('0')),
      ]);
    case 'non-empty-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('!==', s, literalArg("''")),
      ]);
    case 'non-falsy-string':
    case 'truthy-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('!==', s, literalArg("''")),
        binExpr('!==', s, literalArg("'0'")),
      ]);
    case 'non-empty-mixed':
      return andExpr([
        binExpr('!==', s, literalArg('false')),
        binExpr('!==', s, literalArg('0')),
        binExpr('!==', s, literalArg('0.0')),
        binExpr('!==', s, literalArg("''")),
        binExpr('!==', s, literalArg("'0'")),
        binExpr('!==', s, literalArg('[]')),
        binExpr('!==', s, literalArg('null')),
      ]);
    case 'empty':
      return orExpr([
        binExpr('===', s, literalArg('false')),
        binExpr('===', s, literalArg('0')),
        binExpr('===', s, literalArg('0.0')),
        binExpr('===', s, literalArg("''")),
        binExpr('===', s, literalArg("'0'")),
        binExpr('===', s, literalArg('[]')),
        binExpr('===', s, literalArg('null')),
      ]);
    case 'class-string':
    case 'interface-string':
    case 'trait-string':
      return andExpr([
        callExpr('is_string', [s]),
        callExpr('class_exists', [s]),
      ]);
    case 'enum-string':
      return andExpr([
        callExpr('is_string', [s]),
        callExpr('enum_exists', [s]),
      ]);
    case 'numeric-string':
      return andExpr([
        callExpr('is_string', [s]),
        callExpr('is_numeric', [s]),
      ]);
    case 'callable-string':
      return andExpr([
        callExpr('is_string', [s]),
        callExpr('is_callable', [s]),
      ]);
    case 'lowercase-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('===', callArg('strtolower', [s]), s),
      ]);
    case 'uppercase-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('===', callArg('strtoupper', [s]), s),
      ]);
    case 'decimal-int-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr(
          '===',
          callArg('preg_match', [literalArg("'/^-?(?:0|[1-9]\\\\d*)$/'"), s]),
          literalArg('1'),
        ),
      ]);
    case 'non-decimal-int-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr(
          '!==',
          callArg('preg_match', [literalArg("'/^-?(?:0|[1-9]\\\\d*)$/'"), s]),
          literalArg('1'),
        ),
      ]);
    case 'non-empty-lowercase-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('!==', s, literalArg("''")),
        binExpr('===', callArg('strtolower', [s]), s),
      ]);
    case 'non-empty-uppercase-string':
      return andExpr([
        callExpr('is_string', [s]),
        binExpr('!==', s, literalArg("''")),
        binExpr('===', callArg('strtoupper', [s]), s),
      ]);
    case 'literal-string':
    case 'non-empty-literal-string':
      return null;
    default:
      return null;
  }
}

/** Single positive guard expression, or null if uncheckable. */
function exprForType(node: TypeNode, subject: ValueRef): Expr | null {
  const n = normalizeNode(node);

  if (n.kind === 'primitive') {
    return primitiveToExpr(n.name, subject);
  }

  if (n.kind === 'class') {
    return instanceofExpr(subjectArg(subject), n.name);
  }

  if (n.kind === 'literal') {
    const lit = literalPhp(n.value);
    if (lit === null) {
      return null;
    }
    return binExpr('===', subjectArg(subject), literalArg(lit));
  }

  if (n.kind === 'int_range') {
    const s = subjectArg(subject);
    const parts: Expr[] = [callExpr('is_int', [s])];
    if (n.min !== undefined) {
      parts.push(binExpr('>=', s, literalArg(String(n.min))));
    }
    if (n.max !== undefined) {
      parts.push(binExpr('<=', s, literalArg(String(n.max))));
    }
    if (parts.length === 1) {
      return parts[0]!;
    }
    return andExpr(parts);
  }

  return null;
}

/** One or more positive atoms (for consecutive failIf). */
export function exprAtomsForType(node: TypeNode, subject: ValueRef): Expr[] {
  const n = normalizeNode(node);

  const single = exprForType(n, subject);
  if (single !== null) {
    if (single.kind === 'and') {
      return single.exprs;
    }
    return [single];
  }

  if (n.kind === 'primitive' && n.name === 'mixed') {
    return [];
  }

  return [];
}

/** Whether type collapses to a single return expression. */
export function singleExprForType(node: TypeNode, subject: ValueRef): Expr | null {
  const atoms = exprAtomsForType(node, subject);
  if (atoms.length === 1) {
    return atoms[0]!;
  }
  if (atoms.length > 1) {
    return andExpr(atoms);
  }
  return exprForType(node, subject);
}

export function parsePhpExprToIr(expr: string, subjectPath: string): Expr {
  return parseExpressionToExpr(expr, subjectPath);
}
