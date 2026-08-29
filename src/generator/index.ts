import {
  buildMany,
  buildManyNamed,
  optimize,
  renderChecker,
} from './pipeline.ts';
import type { GenerateCheckerOptions } from './options.ts';
import { parsePhpstanTypesFromDocblock, parseTypes } from '../parser/index.ts';

export type GenerateDocblockCheckerOptions = GenerateCheckerOptions & {
  emitPhpstanTypeAliases?: boolean;
  /** Inline alias cross-references instead of calling entry checkers. Default: false. */
  resolveAliases?: boolean;
};

/** Composed pipeline; used by fixture tests. */
export function generateChecker(
  typeString: string,
  options?: GenerateCheckerOptions,
): string {
  const { segments } = parseTypes(typeString);
  const types = segments.map((s) => s.ast);
  const { ir: built, typesByName } = buildMany(types, options);
  const ir = options?.prioritizeReadabilityOverCompactness
    ? built
    : optimize(built);
  return renderChecker(ir, {
    ...options,
    typeString: typeString.trim(),
    typesByName,
  });
}

/** Docblock pipeline; mirrors the UI docblock path. */
export function generateDocblockChecker(
  docblock: string,
  options?: GenerateDocblockCheckerOptions,
): string {
  const defs = parsePhpstanTypesFromDocblock(docblock, {
    resolveAliases: options?.resolveAliases,
  });
  const {
    ir: built,
    typesByName,
    docStringsByName,
    phpstanTypeAliases,
  } = buildManyNamed(
    defs.map((d) => ({
      name: d.name,
      type: d.ast,
      typeString: d.typeString,
    })),
    { segmentSources: defs.map((d) => d.typeString) },
  );
  const ir = options?.prioritizeReadabilityOverCompactness
    ? built
    : optimize(built);
  return renderChecker(ir, {
    ...options,
    typeString: docblock.trim(),
    typesByName,
    docStringsByName,
    phpstanTypeAliases,
    emitPhpstanTypeAliases: options?.emitPhpstanTypeAliases,
  });
}
