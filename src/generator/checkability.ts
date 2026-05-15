import type { TypeNode } from '../parser/ast.ts';
import { GenerationError } from './errors.ts';
import { normalizeGeneric } from './normalize.ts';
import {
  describeNode,
  emitExpression,
  isExpressible,
  isNoOpValueCheck,
} from './simpleTypes.ts';

export type CheckContext = 'expression' | 'value' | 'function';

const UNCHECKABLE_PRIMITIVES = new Set([
  'void',
  'noreturn',
  'never-return',
  'never-returns',
  'no-return',
  'resource',
  'closed-resource',
  'open-resource',
  'static',
  '$this',
  'self',
  'parent',
  'empty',
  'array-key',
  'scalar',
  'empty-scalar',
  'non-empty-scalar',
  'iterable',
  'pure-callable',
  'pure-Closure',
  'callable-object',
  'callable-array',
]);

export function assertCheckable(node: TypeNode, context: CheckContext = 'function'): void {
  switch (node.kind) {
    case 'unsupported':
      throw new GenerationError(
        `Cannot generate runtime check for unsupported type: ${node.raw}`,
        node.raw,
      );
    case 'callable':
      throw new GenerationError(
        'Cannot generate runtime check for callable with parameter/return types; use bare `callable` instead',
        'callable(...)',
      );
    case 'primitive':
      if (UNCHECKABLE_PRIMITIVES.has(node.name)) {
        throw new GenerationError(
          `Cannot generate runtime check for primitive type: ${node.name}`,
          node.name,
        );
      }
      if (context === 'expression' && !isExpressible(node) && !isNoOpValueCheck(node)) {
        throw new GenerationError(
          `Cannot use ${node.name} in expression context`,
          node.name,
        );
      }
      if (context !== 'expression' && !isNoOpValueCheck(node) && emitExpression(node, '$_') === null) {
        throw new GenerationError(
          `Cannot generate runtime check for primitive type: ${node.name}`,
          node.name,
        );
      }
      return;
    case 'literal':
    case 'class':
      return;
    case 'array':
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
              `Union member ${describeNode(member)} cannot be used as a boolean expression (e.g. array keys)`,
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
              `Intersection member ${describeNode(member)} cannot be used as a boolean expression`,
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
        `Cannot generate runtime check for generic type: ${node.name}`,
        `${node.name}<...>`,
      );
    }
    default:
      throw new GenerationError(
        `Cannot generate runtime check for: ${describeNode(node)}`,
        describeNode(node),
      );
  }
}
