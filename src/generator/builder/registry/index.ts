import type { TypeNode } from '../../../parser/ast.ts';
import { allocateUniqueName } from '../../../parser/entryNames.ts';
import { FunctionNameProposer } from '../../../parser/functionNameProposer.ts';
import { formatType } from '../../../parser/format.ts';

export function createFunctionNameRegistry(options?: {
  readonly reservedNames?: readonly string[];
}): FunctionNameRegistry {
  const reserved = options?.reservedNames ?? [];
  return new FunctionNameRegistry(reserved);
}

export class FunctionNameRegistry {
  private readonly assigned = new Map<string, string>();
  private readonly used = new Set<string>();
  private readonly proposer = new FunctionNameProposer();

  constructor(reservedNames: Iterable<string> = []) {
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
    const candidate = allocateUniqueName(base, this.used);
    this.used.add(candidate);
    this.assigned.set(key, candidate);
    return candidate;
  }

  /** Reserve a name so helpers and later entries do not collide with it. */
  reserveName(name: string): void {
    this.used.add(name);
  }

  /** Assign an explicit name for a type (e.g. an entry checker). Idempotent when unchanged. */
  set(type: TypeNode, fnName: string): void {
    const key = FunctionNameRegistry.key(type);
    const existing = this.assigned.get(key);
    if (existing !== undefined) {
      return;
    }
    this.used.add(fnName);
    this.assigned.set(key, fnName);
  }
}
