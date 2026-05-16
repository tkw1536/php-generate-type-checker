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
import { normalizeNode } from '../semantics/normalize.ts';


/** Single positive guard expression, or null if uncheckable. */
export function exprForType(node: TypeNode, subject: ValueRef): Expr | null {
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
      return parts[0];
    }
    return andExpr(parts);
  }

  return null;
}

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

