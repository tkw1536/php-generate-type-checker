import type { Arg, Expr, ValueRef } from '../ir/types.ts';
import {
  andExpr,
  binExpr,
  boolLit,
  callArg,
  callExpr,
  literalArg,
  orExpr,
  refArg,
} from '../ir/index.ts';

export function keywordToBoolean(
  keyword: string,
  subject: ValueRef,
): Expr | null {
  const s = refArg(subject);
  return (
    primitiveKeyword(keyword, s) ??
    intKeyword(keyword, s) ??
    stringKeyword(keyword, s) ??
    truthinessKeyword(keyword, s)
  );
}

function primitiveKeyword(keyword: string, s: Arg): Expr | null {
  switch (keyword) {
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
      return boolLit(false);
    case 'true':
      return binExpr('===', s, literalArg('true'));
    case 'false':
      return binExpr('===', s, literalArg('false'));
    case 'callable':
      return callExpr('is_callable', [s]);
    case 'array-key':
      return orExpr([callExpr('is_string', [s]), callExpr('is_int', [s])]);
    default:
      return null;
  }
}

function intKeyword(keyword: string, s: Arg): Expr | null {
  switch (keyword) {
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
    default:
      return null;
  }
}

function stringKeyword(keyword: string, s: Arg): Expr | null {
  return stringKeywordSimple(keyword, s) ?? stringKeywordCased(keyword, s);
}

function stringKeywordSimple(keyword: string, s: Arg): Expr | null {
  switch (keyword) {
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
    default:
      return null;
  }
}

function stringKeywordCased(keyword: string, s: Arg): Expr | null {
  switch (keyword) {
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
    default:
      return null;
  }
}

function truthinessKeyword(keyword: string, s: Arg): Expr | null {
  switch (keyword) {
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
    default:
      return null;
  }
}
