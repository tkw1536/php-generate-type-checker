export { parseType, ParseError, LexerError, tokenize } from './parser/index.ts';
export {
  generateChecker,
  GenerationError,
  emitBody,
  emitExpression,
  assertCheckable,
} from './generator/index.ts';
export type { TypeNode, ShapeField, CallableSig, CallableParam } from './parser/ast.ts';
