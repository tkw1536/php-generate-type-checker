export { parseType, ParseError, LexerError, tokenize } from './parser/index.ts';
export {
  type CheckerOutputMode,
  type GenerateCheckerOptions,
  type CheckerIR,
  type BuildResult,
  build,
  optimize,
  render,
  GenerationError,
  assertCheckable,
  normalizeNode,
} from './generator/index.ts';
export type { TypeNode, ShapeField, CallableSig, CallableParam } from './parser/ast.ts';
