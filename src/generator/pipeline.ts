import type { TypeNode } from '../parser/ast.ts';
import type { CheckerIR } from './ir/types.ts';
import { Builder } from './builder/';
import {
  createFunctionNameRegistry,
  type FunctionNameRegistry,
} from './builder/registry.ts';
import { optimize as optimizeIr } from './optimizer/';
import type { GenerateCheckerOptions } from './options.ts';
import { render } from './render/index.ts';
import { formatTypeForPhpstanDoc } from './render/phpdoc.ts';

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
    this.registry.set(rootType, entryName);
    if (!this.ir.order.includes(entryName)) {
      this.ir.order.unshift(entryName);
    }
    this.materialize(entryName, rootType, false);
    return {
      ir: { order: [...this.ir.order], programs: { ...this.ir.programs } },
      typesByName: { ...this.typesByName },
    };
  }

  private resolveName(type: TypeNode): string {
    const fnName = this.registry.get(type);
    if (this.ir.programs[fnName] !== undefined) {
      return fnName;
    }
    this.loopScopes.push({ loopVarN: 0 });
    try {
      this.materialize(fnName, type, true);
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
    this.typesByName[fnName] = type;
    if (addToOrder) {
      this.ir.order.push(fnName);
    }
  }
}

/** Build unoptimized {@link CheckerIR} and per-function type map. */
export function build(type: TypeNode, options?: BuildOptions): BuildResult {
  const nameByType = options?.nameFunctionsByType !== false;
  const registry = createFunctionNameRegistry({
    nameFunctionsByType: nameByType,
    reservedNames: options?.reservedNames ?? [],
  });
  const pipeline = new PipelineBuilder(registry, options);
  const entryName =
    options?.mainFunctionName ?? (nameByType ? registry.get(type) : 'check');
  return pipeline.buildEntry(type, entryName);
}

export function optimize(ir: CheckerIR): CheckerIR {
  return optimizeIr(ir);
}

export type { CheckerIR } from './ir/types.ts';

export function renderChecker(
  ir: CheckerIR,
  input: RenderCheckerInput,
): string {
  const docsByName: Record<string, string> = {};
  for (const [name, type] of Object.entries(input.typesByName)) {
    docsByName[name] = formatTypeForPhpstanDoc(type);
  }
  const entryName = ir.order[0] ?? 'check';
  const entryDocType =
    docsByName[entryName] ??
    input.typeString.trim().replace(/\*\//g, '* /');

  return render(ir, {
    ...input,
    entryDocType,
    docsByName,
  });
}
