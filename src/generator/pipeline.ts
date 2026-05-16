import type { TypeNode } from '../parser/ast.ts';
import type { CheckerIR } from './ir/types.ts';
import { IRBuilder } from './builder/IRBuilder.ts';
import {
  CheckerFunctionNameRegistry,
  toIsFunctionIdentifier,
  typeToPascalSlug,
} from './builder/checkerFunctionNames.ts';
import { optimize as optimizeIr } from './optimizer/IROptimizer.ts';
import { render, type RenderOptions } from './render/IRRenderer.ts';
import { normalizeNode } from './normalize.ts';
import type { GenerateCheckerOptions } from './php.ts';
import { typeDedupeKey } from './typeKey.ts';

const DEFAULT_PARAMETER = '$value';

export type BuildOptions = GenerateCheckerOptions & {
  parameter?: string;
  reservedNames?: string[];
};

export type BuildResult = {
  ir: CheckerIR;
  typesByName: Record<string, TypeNode>;
};

type LoopScope = { loopVarN: number };

class PipelineBuilder {
  private readonly ir: CheckerIR = { programs: {}, order: [] };
  readonly typesByName: Record<string, TypeNode> = {};
  private readonly parameter: string;
  private readonly nameFunctionsByType: boolean;
  private readonly registry: CheckerFunctionNameRegistry | null;
  private readonly loopScopes: LoopScope[] = [{ loopVarN: 0 }];
  private readonly byKey = new Map<string, string>();
  private nextLegacyId = 1;

  constructor(options?: BuildOptions) {
    this.parameter = options?.parameter ?? DEFAULT_PARAMETER;
    this.nameFunctionsByType = options?.nameFunctionsByType !== false;
    const reserved = options?.reservedNames ?? [];
    this.registry = this.nameFunctionsByType
      ? new CheckerFunctionNameRegistry(reserved)
      : null;
  }

  buildEntry(rootType: TypeNode, entryName: string): BuildResult {
    const n = normalizeNode(rootType);
    const key = typeDedupeKey(n);
    this.byKey.set(key, entryName);
    if (!this.ir.order.includes(entryName)) {
      this.ir.order.unshift(entryName);
    }
    this.materialize(entryName, n, false);
    return {
      ir: { order: [...this.ir.order], programs: { ...this.ir.programs } },
      typesByName: { ...this.typesByName },
    };
  }

  private resolveName(type: TypeNode): string {
    const n = normalizeNode(type);
    const key = typeDedupeKey(n);
    const existing = this.byKey.get(key);
    if (existing !== undefined) {
      return existing;
    }

    let fnName: string;
    if (this.nameFunctionsByType && this.registry) {
      fnName = this.registry.allocate(key, n);
    } else {
      fnName = `check_${this.nextLegacyId++}`;
    }
    this.byKey.set(key, fnName);
    this.loopScopes.push({ loopVarN: 0 });
    try {
      this.materialize(fnName, n, true);
    } finally {
      this.loopScopes.pop();
    }
    return fnName;
  }

  private materialize(fnName: string, type: TypeNode, addToOrder: boolean): void {
    if (this.ir.programs[fnName] !== undefined) {
      return;
    }
    const program = new IRBuilder().build(type, this.parameter, {
      parameter: this.parameter,
      resolveCheckerName: (t) => this.resolveName(t),
      allocateLoopPair: () => {
        const scope = this.loopScopes[this.loopScopes.length - 1]!;
        const id = ++scope.loopVarN;
        return { key: `$key${id}`, value: `$value${id}` };
      },
    });
    this.ir.programs[fnName] = program;
    this.typesByName[fnName] = normalizeNode(type);
    if (addToOrder) {
      this.ir.order.push(fnName);
    }
  }
}

/** Build unoptimized {@link CheckerIR} and per-function type map. */
export function build(type: TypeNode, options?: BuildOptions): BuildResult {
  const n = normalizeNode(type);
  const nameByType = options?.nameFunctionsByType !== false;
  const mainFunctionName =
    options?.mainFunctionName ??
    (nameByType ? toIsFunctionIdentifier(typeToPascalSlug(n)) : 'check');
  const builder = new PipelineBuilder({
    ...options,
    reservedNames: [mainFunctionName, ...(options?.reservedNames ?? [])],
  });
  return builder.buildEntry(n, mainFunctionName);
}

/** Compact {@link CheckerIR}. */
export function optimize(ir: CheckerIR): CheckerIR {
  return optimizeIr(ir);
}

export type { RenderOptions };

/** Render {@link CheckerIR} to PHP source. */
export function renderChecker(ir: CheckerIR, options: RenderOptions): string {
  return render(ir, options);
}

export type { CheckerIR } from './ir/types.ts';
