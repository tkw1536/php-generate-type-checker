export {
  parseType,
  parseTypes,
  ParseError,
  type TypeSegment,
  type ParseTypesResult,
} from './parser.ts';
export {
  extractPhpstanTypes,
  isDocblockInput,
  formatPhpstanTypeAliasesBlock,
  PhpstanTypeExtractError,
  type PhpstanTypeDef,
  type PhpstanTypeAlias,
} from './phpstanTypeDocblock.ts';
export {
  parsePhpstanTypesFromDocblock,
  resolveTypeAliases,
  TypeAliasResolveError,
  namedAliasReferences,
  type ResolvedPhpstanType,
  type ParsePhpstanTypesFromDocblockOptions,
} from './resolveTypeAliases.ts';
export { LexerError, tokenize } from './lexer.ts';
export type {
  TypeNode,
  ShapeField,
  CallableSig,
  CallableParam,
} from './ast.ts';
export { isKeyword as isPrimitiveName } from './ast.ts';
