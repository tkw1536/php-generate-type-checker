import type { TypeNode } from '../parser/ast.ts';
import type { CheckerIR } from './ir/types.ts';
import { Builder } from './builder/';
import {
  createFunctionNameRegistry,
  type FunctionNameRegistry,
} from './builder/registry.ts';
import { optimize as optimizeIr } from './optimizer/';
import type { GenerateCheckerOptions } from './options.ts';
import { render, type RenderOptions } from './render/index.ts';
import { formatTypeForPhpstanDoc } from './render/phpdoc.ts';
import { normalizeNode } from './semantics/normalize.ts';

const DEFAULT_PARAMETER = '$value';

export type BuildOptions = GenerateCheckerOptions & {
  parameter?: string;
  reservedNames?: string[];
};

export type BuildResult = {
  ir: CheckerIR;
  typesByName: Record<string, TypeNode>;
};

export type RenderCheckerInput = GenerateCheckerOptions & {
  typeString: string;
  typesByName: Record<string, TypeNode>;
};

type LoopScope = { loopVarN: number };

class PipelineBuilder {
  private readonly ir: CheckerIR = { programs: {}, order: [] };
  readonly typesByName: Record<string, TypeNode> = {};
  private readonly parameter: string;
  private readonly registry: FunctionNameRegistry;
  private readonly loopScopes: LoopScope[] = [{ loopVarN: 0 }];

  constructor(registry: FunctionNameRegistry, options?: BuildOptions) {
    this.parameter = options?.parameter ?? DEFAULT_PARAMETER;
    this.registry = registry;
  }

  buildEntry(rootType: TypeNode, entryName: string): BuildResult {
    const n = normalizeNode(rootType);
    this.registry.set(n, entryName);
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
    const fnName = this.registry.get(n);
    if (this.ir.programs[fnName] !== undefined) {
      return fnName;
    }
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
    const program = new Builder().build(type, this.parameter, {
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
  const registry = createFunctionNameRegistry({
    nameFunctionsByType: nameByType,
    reservedNames: options?.reservedNames ?? [],
  });

  let mainFunctionName: string;
  if (options?.mainFunctionName !== undefined) {
    mainFunctionName = options.mainFunctionName;
    registry.set(n, mainFunctionName);
  } else if (nameByType) {
    mainFunctionName = registry.get(n);
  } else {
    mainFunctionName = 'check';
    registry.set(n, mainFunctionName);
  }

  const builder = new PipelineBuilder(registry, options);
  return builder.buildEntry(n, mainFunctionName);
}

/** Compact {@link CheckerIR}. */
export function optimize(ir: CheckerIR): CheckerIR {
  return optimizeIr(ir);
}

export type { RenderOptions };

/** Render {@link CheckerIR} to PHP source. */
export function renderChecker(ir: CheckerIR, options: RenderCheckerInput): string {
  const docsByName = Object.fromEntries(
    Object.entries(options.typesByName).map(([name, type]) => [
      name,
      formatTypeForPhpstanDoc(type),
    ]),
  );
  const entryName = options.mainFunctionName ?? ir.order[0] ?? 'check';
  const renderOptions: RenderOptions = {
    output: options.output,
    nameFunctionsByType: options.nameFunctionsByType,
    mainFunctionName: options.mainFunctionName,
    prioritizeReadabilityOverCompactness: options.prioritizeReadabilityOverCompactness,
    docsByName,
    entryDocType: docsByName[entryName] ?? options.typeString,
  };
  return render(ir, renderOptions);
}

export type { CheckerIR } from './ir/types.ts';
