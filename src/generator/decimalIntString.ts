import type { Arg, Expr } from './ir/types.ts';
import {
  andExpr,
  binExpr,
  callArg,
  callExpr,
  literalArg,
} from './ir/index.ts';

/** PHPStan decimal-int-string pattern (IR literal for `preg_match`). */
export const DECIMAL_INT_STRING_PATTERN = "'/^-?(?:0|[1-9]\\\\d*)$/'";

export function decimalIntStringExpr(subject: Arg): Expr {
  return andExpr([
    callExpr('is_string', [subject]),
    binExpr(
      '===',
      callArg('preg_match', [literalArg(DECIMAL_INT_STRING_PATTERN), subject]),
      literalArg('1'),
    ),
  ]);
}

export function nonDecimalIntStringExpr(subject: Arg): Expr {
  return andExpr([
    callExpr('is_string', [subject]),
    binExpr(
      '!==',
      callArg('preg_match', [literalArg(DECIMAL_INT_STRING_PATTERN), subject]),
      literalArg('1'),
    ),
  ]);
}
