import type { TypeNode } from '../parser/ast.ts';
import { buildCheckerIR, type BuildCheckerContext } from './builder/buildCheckerIR.ts';
import {
  CheckerFunctionNameRegistry,
  toIsFunctionIdentifier,
  typeToPascalSlug,
} from './builder/checkerFunctionNames.ts';
import type { CheckerProgram } from './checkerIR.ts';
import { normalizeNode } from './normalize.ts';
import {
  optimizeCheckerIR,
  type OptimizeCheckerIRInput,
} from './optimizer/optimizeCheckerIR.ts';
import { typeDedupeKey } from './typeKey.ts';

const DEFAULT_PARAMETER = '$value';

type LoopScope = { loopIdN: number; loopVarN: number };

/** Loop ids and `$keyN` / `$valueN` pairs while materializing nested checker functions. */
class CheckerLoopScopes {
  private scopes: LoopScope[] = [{ loopIdN: 0, loopVarN: 0 }];

  pushScope(): void {
    this.scopes.push({ loopIdN: 0, loopVarN: 0 });
  }

  popScope(): void {
    if (this.scopes.length <= 1) {
      throw new Error('internal: cannot pop root loop scope');
    }
    this.scopes.pop();
  }

  currentScope(): LoopScope {
    return this.scopes[this.scopes.length - 1]!;
  }
}

export type CheckerIR = {
  programs: Record<string, CheckerProgram>;
  order: string[];
};

export type CheckerPipeline = {
  built: CheckerIR;
  optimized: CheckerIR;
  typesByName: Record<string, TypeNode>;
  namesByTypeKey: Record<string, string>;
};

export type BuildCheckerPipelineOptions = {
  parameter?: string;
  nameFunctionsByType?: boolean;
  reservedNames?: string[];
  mainFunctionName?: string;
  prioritizeReadabilityOverCompactness?: boolean;
  /** When not `function`, IR calls use `self::name` during build. */
  output?: import('./php.ts').CheckerOutputMode;
};

function createCheckerIR(order: string[]): CheckerIR {
  return { programs: {}, order };
}

function createCheckerPipeline(): CheckerPipeline {
  const order: string[] = [];
  return {
    built: createCheckerIR(order),
    optimized: createCheckerIR(order),
    typesByName: {},
    namesByTypeKey: {},
  };
}

export function formatCheckerIR(ir: CheckerIR): string {
  return JSON.stringify({ order: ir.order, programs: ir.programs }, null, 2);
}

class CheckerPipelineBuilder {
  private readonly pipeline = createCheckerPipeline();
  private readonly parameter: string;
  private readonly optimizeInput: OptimizeCheckerIRInput | undefined;
  private readonly nameFunctionsByType: boolean;
  private readonly registry: CheckerFunctionNameRegistry | null;
  private readonly loopScopes = new CheckerLoopScopes();
  private readonly byKey = new Map<string, string>();
  private nextLegacyId = 1;
  private readonly useSelfCalls: boolean;

  constructor(options?: BuildCheckerPipelineOptions) {
    this.parameter = options?.parameter ?? DEFAULT_PARAMETER;
    this.nameFunctionsByType = options?.nameFunctionsByType !== false;
    this.useSelfCalls = (options?.output ?? 'function') !== 'function';
    this.optimizeInput = {
      preserveStatementOrder: options?.prioritizeReadabilityOverCompactness === true,
    };
    const reserved = options?.reservedNames ?? [];
    this.registry = this.nameFunctionsByType
      ? new CheckerFunctionNameRegistry(reserved)
      : null;
  }

  get result(): CheckerPipeline {
    return this.pipeline;
  }

  materializeEntry(rootType: TypeNode, entryName: string): void {
    const n = normalizeNode(rootType);
    const key = typeDedupeKey(n);
    this.byKey.set(key, entryName);
    this.pipeline.namesByTypeKey[key] = entryName;
    if (!this.pipeline.built.order.includes(entryName)) {
      this.pipeline.built.order.unshift(entryName);
    }
    this.materializeProgram(entryName, n, false);
  }

  resolveCheckerFunction(type: TypeNode): string {
    const n = normalizeNode(type);
    const key = typeDedupeKey(n);
    const existing = this.byKey.get(key);
    if (existing !== undefined) {
      return this.formatCall(existing);
    }

    let fnName: string;
    if (this.nameFunctionsByType && this.registry) {
      fnName = this.registry.allocate(key, n);
    } else {
      fnName = `check_${this.nextLegacyId++}`;
    }
    this.byKey.set(key, fnName);
    this.pipeline.namesByTypeKey[key] = fnName;

    this.loopScopes.pushScope();
    try {
      this.materializeProgram(fnName, n, true);
    } finally {
      this.loopScopes.popScope();
    }
    return this.formatCall(fnName);
  }

  private formatCall(fnName: string): string {
    return this.useSelfCalls ? `self::${fnName}` : fnName;
  }

  private materializeProgram(fnName: string, type: TypeNode, addToEmitOrder: boolean): void {
    if (this.pipeline.built.programs[fnName] !== undefined) {
      return;
    }
    const built = buildCheckerIR(type, this.parameter, this.createBuildContext());
    const optimized = optimizeCheckerIR(built, this.optimizeInput);
    this.pipeline.built.programs[fnName] = built;
    this.pipeline.optimized.programs[fnName] = optimized;
    this.pipeline.typesByName[fnName] = type;
    if (addToEmitOrder) {
      this.pipeline.built.order.push(fnName);
    }
  }

  private createBuildContext(): BuildCheckerContext {
    const scope = this.loopScopes.currentScope();
    return {
      parameter: this.parameter,
      resolveCheckerFunction: (type) => this.resolveCheckerFunction(type),
      nextLoopId: () => `loop${++scope.loopIdN}`,
      allocateLoopPair: () => {
        const id = ++scope.loopVarN;
        return { key: `$key${id}`, value: `$value${id}` };
      },
    };
  }
}

export function buildCheckerPipeline(
  rootType: TypeNode,
  options?: BuildCheckerPipelineOptions,
): CheckerPipeline {
  const n = normalizeNode(rootType);
  const nameByType = options?.nameFunctionsByType !== false;
  const mainFunctionName =
    options?.mainFunctionName ??
    (nameByType ? toIsFunctionIdentifier(typeToPascalSlug(n)) : 'check');
  const builder = new CheckerPipelineBuilder({
    ...options,
    reservedNames: [mainFunctionName, ...(options?.reservedNames ?? [])],
  });
  builder.materializeEntry(n, mainFunctionName);
  return builder.result;
}
