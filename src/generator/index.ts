import { assertCheckable } from './checkability.ts';
import {
  buildCheckerPipeline,
  formatCheckerIR,
} from './checkerPipeline.ts';
import { CheckerCodegen } from './emit.ts';
import {
  toIsFunctionIdentifier,
  typeToPascalSlug,
} from './checkerFunctionNames.ts';
import { normalizeNode } from './normalize.ts';
import {
  type GenerateCheckerOptions,
  generateCheckerFromAst,
} from './php.ts';
import { parseType } from '../parser/index.ts';
import { formatTypeForPhpstanDoc } from './typeDoc.ts';

export function generateChecker(
  typeString: string,
  options?: GenerateCheckerOptions,
): string {
  const ast = normalizeNode(parseType(typeString));
  assertCheckable(ast, 'function');
  const nameByType = options?.nameFunctionsByType !== false;
  const mainFunctionName =
    options?.mainFunctionName ??
    (nameByType ? toIsFunctionIdentifier(typeToPascalSlug(ast)) : 'check');
  const merged: GenerateCheckerOptions = { ...options, mainFunctionName };
  const { helpers, body } = new CheckerCodegen(merged).emitBody(ast, '$value');
  const docType = formatTypeForPhpstanDoc(ast);
  return generateCheckerFromAst(docType, body, merged, helpers || undefined);
}

/** Pretty-printed checker IR before and after {@link optimizeCheckerIR}. */
export function checkerIRSnapshotsForType(
  typeString: string,
  options?: Pick<
    GenerateCheckerOptions,
    'prioritizeReadabilityOverCompactness' | 'nameFunctionsByType' | 'mainFunctionName'
  >,
): { built: string; optimized: string } {
  const ast = normalizeNode(parseType(typeString));
  assertCheckable(ast, 'function');
  const nameByType = options?.nameFunctionsByType !== false;
  const mainFunctionName =
    options?.mainFunctionName ??
    (nameByType ? toIsFunctionIdentifier(typeToPascalSlug(ast)) : 'check');
  const pipeline = buildCheckerPipeline(ast, {
    prioritizeReadabilityOverCompactness:
      options?.prioritizeReadabilityOverCompactness,
    nameFunctionsByType: nameByType,
    mainFunctionName,
  });
  return {
    built: formatCheckerIR(pipeline.built),
    optimized: formatCheckerIR(pipeline.optimized),
  };
}

export { GenerationError } from './errors.ts';
export {
  buildCheckerPipeline,
  formatCheckerIR,
  type CheckerIR,
  type CheckerPipeline,
  type BuildCheckerPipelineOptions,
} from './checkerPipeline.ts';
export {
  CheckerCodegen,
  emitBody,
  emitFromPipeline,
  type EmittedCheckerBody,
  emitExpression,
  needsStatementBlock,
} from './emit.ts';
export { assertCheckable } from './checkability.ts';
export { isExpressible, isNoOpValueCheck } from './simpleTypes.ts';
export {
  type CheckerOutputMode,
  DEFAULT_CHECKER_OUTPUT,
  formatCheckerOutput,
  formatClassCheckerOutput,
  type GenerateCheckerOptions,
  generateCheckerFromAst,
  wrapChecker,
} from './php.ts';
export { normalizeNode } from './normalize.ts';
export { optimizeCheckerIR, type OptimizeCheckerIRInput } from './normalizeCheckerIR.ts';
