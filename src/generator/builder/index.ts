export {
  buildCheckerIR,
  CheckerIRBuilder,
  type BuildCheckerContext,
} from './buildCheckerIR.ts';
export {
  checksForType,
  checkForReturnIf,
  expressionToChecks,
  expressionToMatchArms,
  type ChecksFromTypeContext,
} from './checksFromType.ts';
export {
  CheckerFunctionNameRegistry,
  toIsFunctionIdentifier,
  typeToPascalSlug,
} from './checkerFunctionNames.ts';
