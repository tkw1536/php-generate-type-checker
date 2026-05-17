import type { TypeNode } from '../../parser/ast.ts';
import { GenerationError } from '../errors.ts';
import { describeNode } from './describe.ts';
import { isExpressible, isNoOpValueCheck } from './expressibility.ts';
import { isSupportedLeafType } from './leaves.ts';
import {
  collectionHasValuesForm,
  collectionListElement,
  isBareListKeyword,
  isIterableKeyword,
  isListKeyword,
} from './collection.ts';

export type CheckContext = 'expression' | 'value' | 'function';

const UNCHECKABLE_KEYWORDS = new Set([
  'void',
  'static',
  '$this',
  'self',
  'parent',
]);

export function assertCheckable(node: TypeNode, context: CheckContext = 'function'): void {
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
    case 'keyword': {
      const kw = node.keyword;
      if (isBareListKeyword(node)) {
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
      if (context === 'expression' && !isExpressible(node) && !isNoOpValueCheck(node)) {
        throw new GenerationError(
          `Cannot generate a runtime check for the type ${kw} in expression context: not representable as a single boolean PHP expression (for example as an array key type)`,
          kw,
        );
      }
      if (context !== 'expression' && !isNoOpValueCheck(node) && !isSupportedLeafType(node)) {
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
      if ('key' in node) {
        assertCheckable(node.key, 'expression');
        assertCheckable(node.value, 'value');
        return;
      }
      if ('value' in node) {
        if (isIterableKeyword(node.keyword)) {
          throw new GenerationError(
            'Cannot generate a runtime check for parameterized iterable: validating keys or elements would require foreach iteration and is not side-effect-free',
            `${node.keyword}<...>`,
          );
        }
        assertCheckable(node.value, 'value');
        return;
      }
      if (collectionHasValuesForm(node)) {
        if (isListKeyword(node.keyword)) {
          const el = collectionListElement(node);
          if (el) {
            assertCheckable(el, 'value');
          }
          return;
        }
        for (const el of node.values) {
          assertCheckable(el, 'value');
        }
        return;
      }
      return;
    }
    case 'array':
      assertCheckable(node.value, 'value');
      return;
    case 'shape':
      for (const field of node.fields) {
        assertCheckable(field.value, 'value');
      }
      return;
    case 'union':
      if (context === 'expression') {
        for (const member of node.types) {
          if (!isExpressible(member)) {
            throw new GenerationError(
              `Cannot generate a runtime check for union member ${describeNode(member)} in expression context: not representable as a single boolean PHP expression (for example as an array key type)`,
              describeNode(member),
            );
          }
        }
      } else {
        for (const member of node.types) {
          assertCheckable(member, 'function');
        }
      }
      return;
    case 'intersection':
      for (const member of node.types) {
        assertCheckable(member, context === 'expression' ? 'expression' : 'function');
      }
      if (context === 'expression') {
        for (const member of node.types) {
          if (!isExpressible(member)) {
            throw new GenerationError(
              `Cannot generate a runtime check for intersection member ${describeNode(member)} in expression context: not representable as a single boolean PHP expression`,
              describeNode(member),
            );
          }
        }
      }
      return;
    case 'generic':
      throw new GenerationError(
        `Cannot generate a runtime check for the generic type ${node.name}: not a supported generic for codegen`,
        `${node.name}<...>`,
      );
    default:
      throw new GenerationError(
        `Cannot generate a runtime check for ${describeNode(node)}: this type is not supported for codegen`,
        describeNode(node),
      );
  }
}
