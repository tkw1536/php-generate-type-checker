import { parseType } from '../parser/index.ts';
import { assertCheckable } from './checkability.ts';
import { emitBody } from './emit.ts';
import {
  type GenerateCheckerOptions,
  generateCheckerFromAst,
} from './php.ts';
import { normalizeNode } from './normalize.ts';

export function generateChecker(
  typeString: string,
  options?: GenerateCheckerOptions,
): string {
  const ast = normalizeNode(parseType(typeString));
  assertCheckable(ast, 'function');
  const body = emitBody(ast, '$data');
  return generateCheckerFromAst(typeString, body, options);
}

export { GenerationError } from './errors.ts';
export { emitBody, emitExpression, emitFunctionBody, emitStatementBlock, needsStatementBlock } from './emit.ts';
export { assertCheckable } from './checkability.ts';
export { emitExpression as emitSimpleExpression, isExpressible, isNoOpValueCheck } from './simpleTypes.ts';
export {
  type CheckerOutputMode,
  DEFAULT_CHECKER_OUTPUT,
  formatCheckerOutput,
  type GenerateCheckerOptions,
  generateCheckerFromAst,
  wrapChecker,
} from './php.ts';
export { normalizeNode } from './normalize.ts';
