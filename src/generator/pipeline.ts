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
import type { OptimizeResult } from './optimizer/stats/types.ts';
import {
  DEFAULT_CHECKER_OUTPUT,
  type GenerateCheckerOptions,
} from './options.ts';
import { render } from './render/index.ts';
import { formatTypeForPhpstanDoc } from './render/phpdoc.ts';
import { unsealArrayShapesInType } from './unsealArrayShapes.ts';
import { unsafeStringArrayKeysInType } from './unsafeStringArrayKeys.ts';

export type BuildOptions = GenerateCheckerOptions & {
  readonly parameter?: string;
  readonly reservedNames?: readonly string[];
  /** Source text per root type (for error reporting). */
  readonly segmentSources?: readonly string[];
};

/**
 * Entry after option rewrites: input type drives assert docs; effective AST
 * drives IR / PHP generation (e.g. unsealed shapes).
 */
type PreparedCheckerEntry = {
  readonly functionName: string;
  readonly aliasName: string | null;
  readonly typeString: string;
  /** Text for `@phpstan-assert-if-true` (from the input type). */
  readonly docType: string;
  /** AST used for codegen (may differ from the parsed input). */
  readonly effectiveAst: TypeNode;
};

export type BuildResult = {
  readonly ir: CheckerIR;
  /** Effective types used for codegen (per program name). */
  readonly typesByName: Readonly<Record<string, TypeNode>>;
  /** Assert doc text per entry function name (from input types). */
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
  const prepared = prepareEntriesForBuild(entries, options);
  const registry = createFunctionNameRegistry({
    reservedNames: options?.reservedNames ?? [],
  });
  const aliasCheckerByName = registerAliasCheckers(prepared, registry);
  const builder = new Builder(registry, { aliasCheckerByName });
  const docStringsByName = addParsedEntries(builder, prepared, options);
  return {
    ir: builder.build(),
    typesByName: builder.getTypesByName(),
    docStringsByName,
    phpstanTypeAliases: phpstanAliasesFromEntries(entries),
  };
}

/**
 * Keep assert docs from the input type; rewrite only the effective AST used
 * for IR / PHP generation.
 */
function prepareEntriesForBuild(
  entries: readonly ParsedCheckerEntry[],
  options?: BuildOptions,
): readonly PreparedCheckerEntry[] {
  return entries.map((entry) => ({
    functionName: entry.functionName,
    aliasName: entry.aliasName,
    typeString: entry.typeString,
    docType: entry.docType,
    effectiveAst: effectiveAstForOptions(entry.ast, options),
  }));
}

/** Apply generate-option AST rewrites (input type for asserts is unchanged). */
function effectiveAstForOptions(
  ast: TypeNode,
  options?: BuildOptions,
): TypeNode {
  let result = ast;
  if (options?.unsafeStringArrayKeys === true) {
    result = unsafeStringArrayKeysInType(result);
  }
  if (options?.sealArrayShapes !== true) {
    result = unsealArrayShapesInType(result);
  }
  return result;
}

function registerAliasCheckers(
  entries: readonly PreparedCheckerEntry[],
  registry: ReturnType<typeof createFunctionNameRegistry>,
): Map<string, string> {
  const aliasCheckerByName = new Map<string, string>();
  for (const entry of entries) {
    if (entry.aliasName !== null) {
      aliasCheckerByName.set(entry.aliasName, entry.functionName);
    }
    registry.set(entry.effectiveAst, entry.functionName);
  }
  return aliasCheckerByName;
}

function addParsedEntries(
  builder: Readonly<Builder>,
  entries: readonly PreparedCheckerEntry[],
  options?: BuildOptions,
): Record<string, string> {
  const docStringsByName: Record<string, string> = {};
  for (const [i, entry] of entries.entries()) {
    try {
      builder.addEntry(entry.functionName, entry.effectiveAst);
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
  entry: PreparedCheckerEntry,
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
  const docStringsByName: Record<string, string> = {};
  for (const [i, tp] of types.entries()) {
    try {
      const effectiveAst = effectiveAstForOptions(tp, options);
      const name = builder.add(effectiveAst);
      // Assert docs always describe the input type, not option rewrites.
      docStringsByName[name] = formatTypeForPhpstanDoc(tp);
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
    docStringsByName,
  };
}

export function optimize(ir: CheckerIR): OptimizeResult {
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
