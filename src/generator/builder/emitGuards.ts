import type { Stmt, ValueRef } from '../ir/types.ts';
import {
  binExpr,
  callExpr,
  failIfStmt,
  literalArg,
  refArg,
} from '../ir/index.ts';
import type { EmitOptions } from './helpers.ts';

export function listGuards(
  subject: ValueRef,
  opts: EmitOptions,
  nonEmpty: boolean,
): Stmt[] {
  const out: Stmt[] = [];
  if (opts.skipContainerGuard) {
    if (!opts.provenArray) {
      out.push(failIfStmt(callExpr('is_array', [refArg(subject)])));
    }
    out.push(failIfStmt(callExpr('array_is_list', [refArg(subject)])));
    if (nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
    return out;
  }
  if (opts.provenArray) {
    out.push(failIfStmt(callExpr('array_is_list', [refArg(subject)])));
    if (nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
    return out;
  }
  out.push(
    failIfStmt(callExpr('is_array', [refArg(subject)])),
    failIfStmt(callExpr('array_is_list', [refArg(subject)])),
  );
  if (nonEmpty) {
    out.push(
      failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
    );
  }
  return out;
}

export function arrayGuards(
  subject: ValueRef,
  opts: EmitOptions,
  nonEmpty: boolean,
  iterable: boolean,
): Stmt[] {
  const out: Stmt[] = [];
  if (!opts.skipContainerGuard && opts.provenArray && !iterable) {
    if (nonEmpty) {
      out.push(
        failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
      );
    }
    return out;
  }
  if (!opts.skipContainerGuard) {
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
    return out;
  }
  if (!opts.provenArray) {
    out.push(
      failIfStmt(
        callExpr(iterable ? 'is_iterable' : 'is_array', [refArg(subject)]),
      ),
    );
  }
  if (nonEmpty) {
    out.push(
      failIfStmt(binExpr('!==', refArg(subject), literalArg('[]'))),
    );
  }
  return out;
}
