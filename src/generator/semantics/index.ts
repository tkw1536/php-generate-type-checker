export { normalizeNode, normalizeGeneric, type ArrayNode } from './normalize.ts';
export { typeDedupeKey } from './keys.ts';
export { describeNode } from './describe.ts';
export {
  flattenUnion,
  sortUnionMembers,
  sortFlattenedUnionMembers,
} from './union.ts';
export {
  isNoOpValueCheck,
  isNeverPrimitive,
  isExpressible,
  needsStatementBlock,
} from './expressibility.ts';
export { isSupportedLeafType, leafPrimitiveSupported } from './leaves.ts';
export { assertCheckable, type CheckContext } from './checkability.ts';
