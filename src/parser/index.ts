export {
  parseType,
  parseTypes,
  ParseError,
  type TypeSegment,
  type ParseTypesResult,
} from './parser.ts';
export {
  extractPhpstanTypesFromComment,
  formatPhpstanTypeAliasesBlock,
  PhpstanTypeExtractError,
  type PhpstanTypeDef,
  type PhpstanTypeAlias,
} from './phpstanTypeDocblock.ts';
export {
  extractInputTypes,
  extractPhpstanTypes,
  type InputTypeEntry,
} from './extractInput.ts';
export {
  aliasToIsName,
  allocateUniqueName,
  assignEntryNames,
  proposeIsStyleName,
} from './entryNames.ts';
export {
  hasPhpstanTypeAliases,
  parseCheckerInput,
  type ParsedCheckerEntry,
  type ParseCheckerInputOptions,
} from './parseInput.ts';
export {
  resolveTypeAliases,
  TypeAliasResolveError,
  namedAliasReferences,
} from './resolveTypeAliases.ts';
export { LexerError, tokenize } from './lexer.ts';
export type {
  TypeNode,
  ShapeField,
  CallableSig,
  CallableParam,
} from './ast.ts';
export { isKeyword as isPrimitiveName } from './ast.ts';
export {
  isAllowedNamedType,
  isPseudoNamedType,
  isValidPhpClassName,
} from './phpClassName.ts';
