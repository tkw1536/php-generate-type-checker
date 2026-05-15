import { parseType } from '../parser/index.ts';
import { assertCheckable } from './checkability.ts';
import { emitBody } from './emit.ts';
import { generateCheckerFromAst } from './php.ts';
import { normalizeNode } from './normalize.ts';

export function generateChecker(typeString: string): string {
  const ast = normalizeNode(parseType(typeString));
  assertCheckable(ast, 'function');
  const body = emitBody(ast, '$data');
  return generateCheckerFromAst(typeString, body);
}

export { GenerationError } from './errors.ts';
export { emitBody, emitExpression, emitFunctionBody, emitStatementBlock, needsStatementBlock } from './emit.ts';
export { assertCheckable } from './checkability.ts';
export { emitExpression as emitSimpleExpression, isExpressible, isNoOpValueCheck } from './simpleTypes.ts';
export { wrapChecker, generateCheckerFromAst } from './php.ts';
export { normalizeNode } from './normalize.ts';
