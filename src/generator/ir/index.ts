export type {
  Arg,
  BinOp,
  Block,
  CheckerIR,
  CheckerProgram,
  Expr,
  Stmt,
  ValueRef,
} from './types.ts';
export {
  andExpr,
  appendTrailingReturn,
  binExpr,
  boolLit,
  callArg,
  callCheckerExpr,
  callExpr,
  failIfStmt,
  instanceofExpr,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  returnStmt,
} from './expr.ts';
export { formatCheckerIR } from './format.ts';
export {
  arrayAccessRef,
  propertyAccessRef,
  renderValueRef,
  variableRef,
} from './refs.ts';
