import type { TypeNode } from '../parser/ast.ts';
import { GenerationError } from './errors.ts';
import type { CheckerIR } from './ir/types.ts';
import { Builder } from './builder/index.ts';
import {
  createFunctionNameRegistry,
} from './builder/registry/index.ts';
import { optimize as optimizeIr } from './optimizer/index.ts';
import type { GenerateCheckerOptions } from './options.ts';
import { render } from './render/index.ts';
import { formatTypeForPhpstanDoc } from './render/phpdoc.ts';

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
  const builder = new Builder(registry);
  for (const [i, tp] of types.entries()) {

    try {
      builder.add(tp);
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
  }
  return {
    ir: builder.build(),
    typesByName: builder.getTypesByName(),
  };
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
