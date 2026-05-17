export {
  parseType,
  parseTypes,
  ParseError,
  LexerError,
  tokenize,
  type TypeSegment,
  type ParseTypesResult,
} from './parser/index.ts';
export {
  type CheckerOutputMode,
  type GenerateCheckerOptions,
  type CheckerIR,
  type BuildResult,
  build,
  buildMany,
  optimize,
  render,
  GenerationError,
} from './generator/index.ts';
export type { TypeNode, ShapeField, CallableSig, CallableParam } from './parser/ast.ts';
