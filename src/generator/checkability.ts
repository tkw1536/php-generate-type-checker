import type { TypeNode } from '../parser/ast.ts';
import { GenerationError } from './errors.ts';
import { normalizeGeneric, type ArrayNode } from './normalize.ts';
import {
  describeNode,
  emitExpression,
  isExpressible,
  isNoOpValueCheck,
} from './simpleTypes.ts';

export type CheckContext = 'expression' | 'value' | 'function';

const UNCHECKABLE_PRIMITIVES = new Set([
  'void',
  'static',
  '$this',
  'self',
  'parent',
  'pure-callable',
  'pure-Closure',
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
    case 'primitive':
      if (node.name === 'literal-string' || node.name === 'non-empty-literal-string') {
        throw new GenerationError(
          'Cannot generate a runtime check for literal-string types: PHP cannot verify PHPStan literal-string semantics at runtime',
          node.name,
        );
      }
      if (node.name === 'open-resource' || node.name === 'closed-resource') {
        throw new GenerationError(
          'Cannot generate a runtime check for open-resource or closed-resource: PHP has no side-effect-free predicate that matches PHPStan open vs closed resource semantics',
          node.name,
        );
      }
      if (UNCHECKABLE_PRIMITIVES.has(node.name)) {
        throw new GenerationError(
          `Cannot generate a runtime check for the primitive type ${node.name}: this built-in is not supported for codegen`,
          node.name,
        );
      }
      if (context === 'expression' && !isExpressible(node) && !isNoOpValueCheck(node)) {
        throw new GenerationError(
          `Cannot generate a runtime check for the primitive type ${node.name} in expression context: not representable as a single boolean PHP expression (for example as an array key type)`,
          node.name,
        );
      }
      if (context !== 'expression' && !isNoOpValueCheck(node) && emitExpression(node, '$_') === null) {
        throw new GenerationError(
          `Cannot generate a runtime check for the primitive type ${node.name}: not representable as a supported boolean assertion in this generator`,
          node.name,
        );
      }
      return;
    case 'literal':
    case 'class':
      return;
    case 'int_range':
      return;
    case 'array':
      if ((node as ArrayNode).iterable) {
        throw new GenerationError(
          'Cannot generate a runtime check for parameterized iterable: validating keys or elements would require foreach iteration and is not side-effect-free',
          'iterable<...>',
        );
      }
      if (node.key) {
        assertCheckable(node.key, 'expression');
      }
      assertCheckable(node.value, 'value');
      return;
    case 'list':
      assertCheckable(node.element, 'value');
      return;
    case 'shape':
      for (const field of node.fields) {
        assertCheckable(field.type, 'value');
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
    case 'generic': {
      const normalized = normalizeGeneric(node);
      if (normalized) {
        assertCheckable(normalized, context);
        return;
      }
      throw new GenerationError(
        `Cannot generate a runtime check for the generic type ${node.name}: not a supported generic for codegen`,
        `${node.name}<...>`,
      );
    }
    default:
      throw new GenerationError(
        `Cannot generate a runtime check for ${describeNode(node)}: this type is not supported for codegen`,
        describeNode(node),
      );
  }
}
