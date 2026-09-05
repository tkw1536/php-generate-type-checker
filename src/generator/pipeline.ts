import type { TypeNode } from '../parser/ast.ts';
import type { ParsedCheckerEntry } from '../parser/parseInput.ts';
import {
  formatPhpstanTypeAliasesBlock,
  type PhpstanTypeAlias,
} from '../parser/phpstanTypeDocblock.ts';
import { GenerationError } from './errors.ts';
import type { CheckerIR } from './ir/types.ts';
import { Builder } from './builder/index.ts';
import {
  createFunctionNameRegistry,
} from './builder/registry/index.ts';
import { optimize as optimizeIr } from './optimizer/index.ts';
import {
  DEFAULT_CHECKER_OUTPUT,
  type GenerateCheckerOptions,
} from './options.ts';
import { render } from './render/index.ts';
import { formatTypeForPhpstanDoc } from './render/phpdoc.ts';

export type BuildOptions = GenerateCheckerOptions & {
  readonly parameter?: string;
  readonly reservedNames?: readonly string[];
  /** Source text per root type (for error reporting). */
  readonly segmentSources?: readonly string[];
};

export type BuildResult = {
  readonly ir: CheckerIR;
  readonly typesByName: Readonly<Record<string, TypeNode>>;
  /** Assert doc text per entry function name. */
  readonly docStringsByName?: Readonly<Record<string, string>>;
  /** `@phpstan-type` alias definitions for optional re-emission. */
  readonly phpstanTypeAliases?: readonly PhpstanTypeAlias[];
};

export type RenderCheckerInput = GenerateCheckerOptions & {
  readonly typeString: string;
  readonly typesByName: Readonly<Record<string, TypeNode>>;
  readonly docStringsByName?: Readonly<Record<string, string>>;
  /** When true, prepend a PHPDoc block of {@link phpstanTypeAliases} to the output. */
  readonly emitPhpstanTypeAliases?: boolean;
  readonly phpstanTypeAliases?: readonly PhpstanTypeAlias[];
};

/**
 * Build IR from {@link parseCheckerInput} results (single generate path).
 */
export function buildEntries(
  entries: readonly ParsedCheckerEntry[],
  options?: BuildOptions,
): BuildResult {
  if (entries.length === 0) {
    throw new GenerationError('No types to build');
  }
  const registry = createFunctionNameRegistry({
    reservedNames: options?.reservedNames ?? [],
  });
  const aliasCheckerByName = registerAliasCheckers(entries, registry);
  const builder = new Builder(registry, { aliasCheckerByName });
  const docStringsByName = addParsedEntries(builder, entries, options);
  return {
    ir: builder.build(),
    typesByName: builder.getTypesByName(),
    docStringsByName,
    phpstanTypeAliases: phpstanAliasesFromEntries(entries),
  };
}

function registerAliasCheckers(
  entries: readonly ParsedCheckerEntry[],
  registry: ReturnType<typeof createFunctionNameRegistry>,
): Map<string, string> {
  const aliasCheckerByName = new Map<string, string>();
  for (const entry of entries) {
    if (entry.aliasName !== null) {
      aliasCheckerByName.set(entry.aliasName, entry.functionName);
    }
    registry.set(entry.ast, entry.functionName);
  }
  return aliasCheckerByName;
}

function addParsedEntries(
  builder: Readonly<Builder>,
  entries: readonly ParsedCheckerEntry[],
  options?: BuildOptions,
): Record<string, string> {
  const docStringsByName: Record<string, string> = {};
  for (const [i, entry] of entries.entries()) {
    try {
      builder.addEntry(entry.functionName, entry.ast);
      docStringsByName[entry.functionName] = entry.docType;
    } catch (err) {
      throw wrapBuildEntryError(err, i, entry, options);
    }
  }
  return docStringsByName;
}

function wrapBuildEntryError(
  err: unknown,
  index: number,
  entry: ParsedCheckerEntry,
  options?: BuildOptions,
): GenerationError {
  const message = err instanceof Error ? err.message : String(err);
  const typeDescription =
    err instanceof GenerationError ? err.typeDescription : undefined;
  const cause = err instanceof Error ? err : undefined;
  return new GenerationError(message, typeDescription, {
    expressionIndex: index,
    segmentSource:
      options?.segmentSources?.[index] ??
      entry.typeString ??
      (err instanceof GenerationError ? err.segmentSource : undefined),
  }, cause);
}

function phpstanAliasesFromEntries(
  entries: readonly ParsedCheckerEntry[],
): PhpstanTypeAlias[] {
  return entries
    .filter(
      (entry): entry is ParsedCheckerEntry & { readonly aliasName: string } =>
        entry.aliasName !== null,
    )
    .map((entry) => ({
      name: entry.aliasName,
      typeString: entry.typeString,
    }));
}

/** Build one combined IR for multiple root types (shared helpers; used by unit tests). */
export function buildMany(
  types: readonly TypeNode[],
  options?: BuildOptions,
): BuildResult {
  if (types.length === 0) {
    throw new GenerationError('No types to build');
  }
  const registry = createFunctionNameRegistry({
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

export function optimize(ir: CheckerIR): CheckerIR {
  return optimizeIr(ir);
}

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
    input.typeString.trim().replaceAll('*/', '* /');

  const aliasesToEmit =
    input.emitPhpstanTypeAliases === true &&
    input.phpstanTypeAliases !== undefined &&
    input.phpstanTypeAliases.length > 0
      ? input.phpstanTypeAliases
      : undefined;

  const mode = input.output ?? DEFAULT_CHECKER_OUTPUT;
  const isClassOutput = mode !== 'function';

  const php = render(ir, {
    ...input,
    entryDocType,
    docsByName,
    // Class modes own the alias block (merged with class PHPDoc when verbose).
    classPhpstanTypeAliases: isClassOutput ? aliasesToEmit : undefined,
  });

  if (!isClassOutput && aliasesToEmit !== undefined) {
    return formatPhpstanTypeAliasesBlock(aliasesToEmit) + php;
  }

  return php;
}
