import type { TypeNode } from '../../parser/ast.ts';
import type { Block, Expr, Stmt, ValueRef } from '../ir/types.ts';
import type { EmitOptions } from './helpers.ts';

/** Shared builder context for emit helpers (mutual recursion via ctx). */
export type EmitCtx = {
  readonly aliasCheckerByName?: ReadonlyMap<string, string>;
  readonly freshVar: () => ValueRef;
  readonly getOrEmitProgram: (type: TypeNode) => string;
  readonly emitStatements: (
    type: TypeNode,
    subject: ValueRef,
    opts: EmitOptions,
  ) => Block;
  readonly booleanForType: (type: TypeNode, subject: ValueRef) => Expr;
  readonly booleanAtoms: (
    type: TypeNode,
    subject: ValueRef,
  ) => readonly Expr[];
  readonly compactCollectionTest: (
    type: TypeNode,
    subject: ValueRef,
  ) => Expr | null;
  readonly checkShapeField: (type: TypeNode, fieldRef: ValueRef) => Block;
  readonly checkInValueLoop: (type: TypeNode, valueRef: ValueRef) => Block;
  readonly listGuards: (subject: ValueRef, nonEmpty: boolean) => Stmt[];
  readonly arrayGuards: (
    subject: ValueRef,
    nonEmpty: boolean,
    iterable: boolean,
  ) => Stmt[];
};
