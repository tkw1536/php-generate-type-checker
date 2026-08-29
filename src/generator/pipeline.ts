import type { TypeNode } from '../parser/ast.ts';
import { GenerationError } from './errors.ts';
import type { CheckerIR } from './ir/types.ts';
import { Builder } from './builder/index.ts';
import {
  createFunctionNameRegistry,
} from './builder/registry/index.ts';
import { aliasToIsName } from './builder/registry/proposer.ts';
import { optimize as optimizeIr } from './optimizer/index.ts';
import type { GenerateCheckerOptions } from './options.ts';
import { render } from './render/index.ts';
import { formatTypeForPhpstanDoc } from './render/phpdoc.ts';
import {
  formatPhpstanTypeAliasesBlock,
  type PhpstanTypeAlias,
} from '../parser/phpstanTypeDocblock.ts';

export type BuildOptions = GenerateCheckerOptions & {
  parameter?: string;
  reservedNames?: string[];
  /** Source text per root type (for error reporting in {@link buildMany}). */
  segmentSources?: string[];
};

export type BuildResult = {
  ir: CheckerIR;
  typesByName: Record<string, TypeNode>;
  /** Original type strings for entry checkers (e.g. @phpstan-type source text). */
  docStringsByName?: Record<string, string>;
  /** @phpstan-type alias definitions from docblock input (for optional re-emission). */
  phpstanTypeAliases?: PhpstanTypeAlias[];
};

export type RenderCheckerInput = GenerateCheckerOptions & {
  typeString: string;
  typesByName: Record<string, TypeNode>;
  docStringsByName?: Record<string, string>;
  /** When true, prepend a PHPDoc block of {@link phpstanTypeAliases} to the output. */
  emitPhpstanTypeAliases?: boolean;
  phpstanTypeAliases?: PhpstanTypeAlias[];
};

export type NamedTypeEntry = {
  name: string;
  type: TypeNode;
  typeString?: string;
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
      const cause = err instanceof Error ? err : undefined;
      throw new GenerationError(message, typeDescription, {
        expressionIndex: i,
        segmentSource:
          options?.segmentSources?.[i] ??
          (err instanceof GenerationError ? err.segmentSource : undefined),
      }, cause);
    }
  }
  return {
    ir: builder.build(),
    typesByName: builder.getTypesByName(),
  };
}

/** Build one combined IR for named @phpstan-type aliases (explicit entry function names). */
export function buildManyNamed(
  entries: NamedTypeEntry[],
  options?: BuildOptions,
): BuildResult {
  if (entries.length === 0) {
    throw new GenerationError('No types to build');
  }
  const nameByType = options?.nameFunctionsByType !== false;
  const registry = createFunctionNameRegistry({
    nameFunctionsByType: nameByType,
    reservedNames: options?.reservedNames ?? [],
  });
  const aliasCheckerByName = new Map<string, string>();
  const docStringsByName: Record<string, string> = {};
  let sequentialIndex = 0;

  for (const entry of entries) {
    const fnName = nameByType
      ? aliasToIsName(entry.name)
      : sequentialIndex === 0
        ? 'check'
        : `check_${sequentialIndex}`;
    sequentialIndex++;
    aliasCheckerByName.set(entry.name, fnName);
    registry.set(entry.type, fnName);
  }

  const builder = new Builder(registry, { aliasCheckerByName });
  sequentialIndex = 0;

  for (const [i, entry] of entries.entries()) {
    const fnName = aliasCheckerByName.get(entry.name)!;

    try {
      builder.addEntry(fnName, entry.type);
      docStringsByName[fnName] = entry.name;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const typeDescription =
        err instanceof GenerationError ? err.typeDescription : undefined;
      const cause = err instanceof Error ? err : undefined;
      throw new GenerationError(message, typeDescription, {
        expressionIndex: i,
        segmentSource:
          options?.segmentSources?.[i] ??
          entry.typeString ??
          (err instanceof GenerationError ? err.segmentSource : undefined),
      }, cause);
    }
  }

  return {
    ir: builder.build(),
    typesByName: builder.getTypesByName(),
    docStringsByName,
    phpstanTypeAliases: entries
      .filter((entry): entry is NamedTypeEntry & { typeString: string } =>
        entry.typeString !== undefined,
      )
      .map((entry) => ({ name: entry.name, typeString: entry.typeString })),
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
    docsByName[name] =
      input.docStringsByName?.[name] ?? formatTypeForPhpstanDoc(type);
  }
  const firstEntry = ir.entries[0] ?? ir.order[0] ?? 'check';
  const entryDocType =
    docsByName[firstEntry] ??
    input.typeString.trim().replace(/\*\//g, '* /');

  const php = render(ir, {
    ...input,
    entryDocType,
    docsByName,
  });

  if (
    input.emitPhpstanTypeAliases &&
    input.phpstanTypeAliases !== undefined &&
    input.phpstanTypeAliases.length > 0
  ) {
    return formatPhpstanTypeAliasesBlock(input.phpstanTypeAliases) + php;
  }

  return php;
}
