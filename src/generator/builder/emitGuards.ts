import type { Stmt, ValueRef } from '../ir/types.ts';
import {
  binExpr,
  callExpr,
  failIfStmt,
  literalArg,
  refArg,
} from '../ir/index.ts';

export function listGuards(subject: ValueRef, nonEmpty: boolean): Stmt[] {
  const out: Stmt[] = [
    failIfStmt(callExpr('is_array', [refArg(subject)])),
    failIfStmt(callExpr('array_is_list', [refArg(subject)])),
  ];
  if (nonEmpty) {
    out.push(failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))));
  }
  return out;
}

export function arrayGuards(
  subject: ValueRef,
  nonEmpty: boolean,
  iterable: boolean,
): Stmt[] {
  const out: Stmt[] = [
    failIfStmt(
      callExpr(iterable ? 'is_iterable' : 'is_array', [refArg(subject)]),
    ),
  ];
  if (nonEmpty) {
    out.push(failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))));
  }
  return out;
}
