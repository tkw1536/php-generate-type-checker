import type { TypeNode } from '../parser/ast.ts';
import { GenerationError } from './errors.ts';
import type { CheckerIR } from './ir/types.ts';
import { build as buildChecker } from './builder/index.ts';
import {
  createFunctionNameRegistry,
  type FunctionNameRegistry,
} from './builder/registry/index.ts';
import { optimize as optimizeIr } from './optimizer/index.ts';
import type { GenerateCheckerOptions } from './options.ts';
import { render } from './render/index.ts';
import { formatTypeForPhpstanDoc } from './render/phpdoc.ts';

const DEFAULT_PARAMETER = '$value';

export type BuildOptions = GenerateCheckerOptions & {
  parameter?: string;
  reservedNames?: string[];
  /** Source text per root type (for error reporting in {@link buildMany}). */
  segmentSources?: string[];
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
  private readonly ir: CheckerIR = { programs: {}, order: [], entries: [] };
  readonly typesByName: Record<string, TypeNode> = {};
  private readonly parameter: string;
  private readonly registry: FunctionNameRegistry;
  private readonly loopScopes: LoopScope[] = [{ loopVarN: 0 }];

  constructor(registry: FunctionNameRegistry, options?: BuildOptions) {
    this.parameter = options?.parameter ?? DEFAULT_PARAMETER;
    this.registry = registry;
  }

  buildEntry(rootType: TypeNode, entryName: string): void {
    this.registry.set(rootType, entryName);
    if (!this.ir.entries.includes(entryName)) {
      this.ir.entries.push(entryName);
    }
    if (!this.ir.order.includes(entryName)) {
      this.ir.order.push(entryName);
    }
    this.materialize(entryName, rootType, false);
  }

  getResult(): BuildResult {
    return {
      ir: {
        order: [...this.ir.order],
        programs: { ...this.ir.programs },
        entries: [...this.ir.entries],
      },
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
    const program = buildChecker(type, this.parameter, {
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

function entryNameFor(
  type: TypeNode,
  index: number,
  registry: FunctionNameRegistry,
  options: BuildOptions | undefined,
  nameByType: boolean,
): string {
  if (index === 0 && options?.mainFunctionName !== undefined) {
    return options.mainFunctionName;
  }
  if (nameByType) {
    return registry.get(type);
  }
  if (index === 0) {
    return 'check';
  }
  return `check_${index + 1}`;
}

/** Build unoptimized {@link CheckerIR} and per-function type map for one root type. */
export function build(type: TypeNode, options?: BuildOptions): BuildResult {
  const nameByType = options?.nameFunctionsByType !== false;
  const registry = createFunctionNameRegistry({
    nameFunctionsByType: nameByType,
    reservedNames: options?.reservedNames ?? [],
  });
  const pipeline = new PipelineBuilder(registry, options);
  const entryName = entryNameFor(type, 0, registry, options, nameByType);
  pipeline.buildEntry(type, entryName);
  return pipeline.getResult();
}

/** Build one combined IR for multiple root types (shared helpers, all entries never pruned). */
export function buildMany(types: TypeNode[], options?: BuildOptions): BuildResult {
  if (types.length === 0) {
    throw new GenerationError('No types to build');
  }
  const nameByType = options?.nameFunctionsByType !== false;
  const registry = createFunctionNameRegistry({
    nameFunctionsByType: nameByType,
    reservedNames: options?.reservedNames ?? [],
  });
  const pipeline = new PipelineBuilder(registry, options);

  for (let i = 0; i < types.length; i++) {
    const type = types[i]!;
    const entryName = entryNameFor(type, i, registry, options, nameByType);
    try {
      pipeline.buildEntry(type, entryName);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const typeDescription =
        err instanceof GenerationError ? err.typeDescription : undefined;
      throw new GenerationError(message, typeDescription, {
        expressionIndex: i,
        segmentSource:
          options?.segmentSources?.[i] ??
          (err instanceof GenerationError ? err.segmentSource : undefined),
      });
    }
    registry.reserveName(entryName);
  }

  return pipeline.getResult();
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
  const firstEntry = ir.entries[0] ?? ir.order[0] ?? 'check';
  const entryDocType =
    docsByName[firstEntry] ??
    input.typeString.trim().replace(/\*\//g, '* /');

  return render(ir, {
    ...input,
    entryDocType,
    docsByName,
  });
}
