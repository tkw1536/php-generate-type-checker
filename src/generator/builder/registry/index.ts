import type { TypeNode } from '../../../parser/ast.ts';
import { formatType } from '../../../parser/format.ts';
import {
  type FunctionNameProposer,
  IsStyleFunctionNameProposer,
  SequentialCheckNameProposer,
} from './proposer.ts';


export function createFunctionNameRegistry(options?: {
  nameFunctionsByType?: boolean;
  reservedNames?: string[];
}): FunctionNameRegistry {
  const reserved = options?.reservedNames ?? [];
  const proposer =
    options?.nameFunctionsByType === false
      ? new SequentialCheckNameProposer()
      : new IsStyleFunctionNameProposer();
  return new FunctionNameRegistry(proposer, reserved);
}

export class FunctionNameRegistry {
  private readonly assigned = new Map<string, string>();
  private readonly used = new Set<string>();
  private readonly proposer: FunctionNameProposer;

  constructor(proposer: FunctionNameProposer, reservedNames: Iterable<string> = []) {
    this.proposer = proposer;
    for (const r of reservedNames) {
      this.used.add(r);
    }
  }

  private static key(type: TypeNode): string {
    return formatType(type);
  }

  get(type: TypeNode): string {
    const key = FunctionNameRegistry.key(type);
    const existing = this.assigned.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const base = this.proposer.name(type);
    const candidate = this.allocateUnique(base);
    this.used.add(candidate);
    this.assigned.set(key, candidate);
    return candidate;
  }

  /** Assign an explicit name for a type (e.g. entry `check`). Idempotent when unchanged. */
  set(type: TypeNode, fnName: string): void {
    const key = FunctionNameRegistry.key(type);
    const existing = this.assigned.get(key);
    if (existing !== undefined) {
      return;
    }
    this.used.add(fnName);
    this.assigned.set(key, fnName);
  }

  private allocateUnique(base: string): string {
    let candidate = base;
    let n = 2;
    while (this.used.has(candidate)) {
      candidate = `${base}_${n}`;
      n++;
    }
    return candidate;
  }
}
