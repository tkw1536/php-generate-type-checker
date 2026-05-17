import type { TypeNode } from '../../parser/ast.ts';
import { GenerationError } from '../errors.ts';
import { describeNode } from './describe.ts';
import { isBareEmptyCollectionKeyword, isIterableKeyword } from './collection.ts';
import { isSupportedLeafType } from './leaves.ts';
import { isCompactLeaf, isNoOpValueCheck } from './structure.ts';

export type BuildCheckContext = 'value' | 'expression';

const UNCHECKABLE_KEYWORDS = new Set([
  'void',
  'static',
  '$this',
  'self',
  'parent',
]);

/** Fail fast when this type cannot be codegen'd in the given context. */
export function rejectUnsupported(
  node: TypeNode,
  context: BuildCheckContext = 'value',
): void {
  switch (node.kind) {
    case 'unsupported':
      throw new GenerationError(
        `Cannot generate a runtime check for unsupported type: ${node.raw}`,
        node.raw,
      );
    case 'callable':
      throw new GenerationError(
        'Cannot generate a runtime check for callable with parameter or return types: parameter and return types cannot be verified without invoking the callable',
        'callable(...)',
      );
    case 'generic':
      throw new GenerationError(
        `Cannot generate a runtime check for the generic type ${node.name}: not a supported generic for codegen`,
        `${node.name}<...>`,
      );
    case 'keyword': {
      const kw = node.keyword;
      if (isBareEmptyCollectionKeyword(node)) {
        return;
      }
      if (kw === 'literal-string' || kw === 'non-empty-literal-string') {
        throw new GenerationError(
          'Cannot generate a runtime check for literal-string types: PHP cannot verify PHPStan literal-string semantics at runtime',
          kw,
        );
      }
      if (UNCHECKABLE_KEYWORDS.has(kw)) {
        throw new GenerationError(
          `Cannot generate a runtime check for the type ${kw}: this built-in is not supported for codegen`,
          kw,
        );
      }
      if (context === 'expression') {
        if (!isCompactLeaf(node) && !isNoOpValueCheck(node)) {
          throw new GenerationError(
            `Cannot generate a runtime check for the type ${kw} in expression context: not representable as a single boolean PHP expression (for example as an array key type)`,
            kw,
          );
        }
        return;
      }
      if (!isNoOpValueCheck(node) && !isSupportedLeafType(node)) {
        throw new GenerationError(
          `Cannot generate a runtime check for the type ${kw}: not representable as a supported boolean assertion in this generator`,
          kw,
        );
      }
      return;
    }
    case 'literal':
      return;
    case 'class': {
      if (node.name === 'closed-resource' || node.name === 'open-resource') {
        throw new GenerationError(
          `Cannot generate a runtime check for the type ${node.name}: PHP cannot distinguish open and closed resources at runtime`,
          node.name,
        );
      }
      return;
    }
    case 'range':
      return;
    case 'collection': {
      if (isIterableKeyword(node.keyword) && 'key' in node) {
        throw new GenerationError(
          'Cannot generate a runtime check for parameterized iterable: validating keys or elements would require foreach iteration and is not side-effect-free',
          `${node.keyword}<...>`,
        );
      }
      if ('value' in node && isIterableKeyword(node.keyword)) {
        throw new GenerationError(
          'Cannot generate a runtime check for parameterized iterable: validating keys or elements would require foreach iteration and is not side-effect-free',
          `${node.keyword}<...>`,
        );
      }
      return;
    }
    case 'array':
    case 'shape':
      return;
    case 'union':
      if (context === 'expression') {
        for (const member of node.types) {
          if (!isCompactLeaf(member)) {
            throw new GenerationError(
              `Cannot generate a runtime check for union member ${describeNode(member)} in expression context: not representable as a single boolean PHP expression (for example as an array key type)`,
              describeNode(member),
            );
          }
        }
      }
      return;
    case 'intersection':
      if (context === 'expression') {
        for (const member of node.types) {
          if (!isCompactLeaf(member)) {
            throw new GenerationError(
              `Cannot generate a runtime check for intersection member ${describeNode(member)} in expression context: not representable as a single boolean PHP expression`,
              describeNode(member),
            );
          }
        }
      }
      return;
    default:
      throw new GenerationError(
        `Cannot generate a runtime check for ${describeNode(node)}: this type is not supported for codegen`,
        describeNode(node),
      );
  }
}

export function rejectUncheckableLeaf(node: TypeNode): never {
  throw new GenerationError(
    `Cannot generate a runtime check for ${describeNode(node)}: not representable as a supported boolean assertion in this generator`,
    describeNode(node),
  );
}
