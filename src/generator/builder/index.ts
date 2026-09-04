import type { TypeNode } from '../../parser/ast.ts';
import type {
  Block,
  CheckerIR,
  CheckerProgram,
  ValueRef,
} from '../ir/types.ts';
import {
  boolLit,
  returnStmt,
  variableRef,
} from '../ir/index.ts';
import {
  booleanAtoms,
  booleanForType,
  compactCollectionTest,
} from './boolean.ts';
import type { EmitCtx } from './emitCtx.ts';
import { arrayGuards, listGuards } from './emitGuards.ts';
import { emitStatements } from './emitStatements.ts';
import type { FunctionNameRegistry } from './registry/index.ts';

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class Builder {
  private readonly programs: Record<string, CheckerProgram> = {};
  private readonly order: string[] = [];
  private readonly entries: string[] = [];
  private readonly typesByName: Record<string, TypeNode> = {};
  private varCounter = 0;
  private readonly registry: FunctionNameRegistry;
  private readonly aliasCheckerByName?: ReadonlyMap<string, string>;
  private readonly ctx: EmitCtx;

  constructor(
    registry: FunctionNameRegistry,
    options?: { readonly aliasCheckerByName?: ReadonlyMap<string, string> },
  ) {
    this.registry = registry;
    this.aliasCheckerByName = options?.aliasCheckerByName;
    this.ctx = this.createCtx();
  }

  add(type: TypeNode): string {
    const name = this.registry.get(type);
    if (this.programs[name] === undefined) {
      this.emit(name, type);
    }
    this.promote(name);
    return name;
  }

  /** Add a root entry with an explicit function name (always promoted, even when types dedupe). */
  addEntry(explicitName: string, type: TypeNode): string {
    this.registry.reserveName(explicitName);
    if (this.programs[explicitName] === undefined) {
      this.emit(explicitName, type);
    }
    this.promote(explicitName);
    return explicitName;
  }

  build(): CheckerIR {
    return {
      programs: { ...this.programs },
      order: [...this.order],
      entries: [...this.entries],
    };
  }

  getTypesByName(): Record<string, TypeNode> {
    return { ...this.typesByName };
  }

  private createCtx(): EmitCtx {
    const ctx: EmitCtx = {
      aliasCheckerByName: this.aliasCheckerByName,
      freshVar: () => this.freshVar(),
      getOrEmitProgram: (type) => this.getOrEmitProgram(type),
      varName: (ref) => this.varName(ref),
      emitStatements: (type, subject, opts) =>
        emitStatements(ctx, type, subject, opts),
      booleanForType: (type, subject) => booleanForType(ctx, type, subject),
      booleanAtoms: (type, subject) => booleanAtoms(ctx, type, subject),
      compactCollectionTest: (type, subject) =>
        compactCollectionTest(ctx, type, subject),
      checkShapeField: (type, fieldRef) => this.checkShapeField(type, fieldRef),
      checkInValueLoop: (type, valueRef) =>
        this.checkInValueLoop(type, valueRef),
      listGuards: (subject, opts, nonEmpty) =>
        listGuards(subject, opts, nonEmpty),
      arrayGuards: (subject, opts, nonEmpty, iterable) =>
        arrayGuards(subject, opts, nonEmpty, iterable),
    };
    return ctx;
  }

  private emit(name: string, type: TypeNode): void {
    const body = this.finishBody(
      this.checkAtRoot(type, variableRef('$value')),
    );
    this.programs[name] = { parameter: '$value', body };
    this.typesByName[name] = type;
    if (!this.order.includes(name)) {
      this.order.push(name);
    }
  }

  private promote(name: string): void {
    if (!this.entries.includes(name)) {
      this.entries.push(name);
    }
  }

  private getOrEmitProgram(type: TypeNode): string {
    const name = this.registry.get(type);
    if (this.programs[name] === undefined) {
      this.emit(name, type);
    }
    return name;
  }

  private freshVar(): ValueRef {
    return variableRef(`$var${this.varCounter++}`);
  }

  private finishBody(block: Block): Block {
    const last = block.at(-1);
    if (last?.kind === 'return') {
      return block;
    }
    return [...block, returnStmt(boolLit(true))];
  }

  private varName(ref: ValueRef): string {
    if (ref.kind !== 'variable') {
      throw new Error('expected variable ValueRef from freshVar()');
    }
    return ref.name;
  }

  private checkAtRoot(type: TypeNode, subject: ValueRef): Block {
    return emitStatements(this.ctx, type, subject, {
      unionRoot: true,
      skipContainerGuard: false,
      provenArray: false,
      provenObject: false,
      inLoop: false,
      insideShapeField: false,
    });
  }

  private checkInValueLoop(type: TypeNode, valueRef: ValueRef): Block {
    return emitStatements(this.ctx, type, valueRef, {
      unionRoot: false,
      skipContainerGuard: false,
      provenArray: false,
      provenObject: false,
      inLoop: true,
      insideShapeField: false,
    });
  }

  private checkShapeField(type: TypeNode, fieldRef: ValueRef): Block {
    return emitStatements(this.ctx, type, fieldRef, {
      unionRoot: false,
      skipContainerGuard: true,
      provenArray: false,
      provenObject: false,
      inLoop: false,
      insideShapeField: true,
    });
  }
}
