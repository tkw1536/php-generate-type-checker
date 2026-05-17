import type { TypeNode } from '../../parser/ast.ts';
import { GenerationError } from '../errors.ts';

function describeRange(node: Extract<TypeNode, { kind: 'range' }>): string {
  const lo = node.min === null ? 'min' : String(node.min);
  const hi = node.max === null ? 'max' : String(node.max);
  return `${node.keyword}<${lo}, ${hi}>`;
}

export function describeNode(node: TypeNode): string {
  switch (node.kind) {
    case 'keyword':
      return node.keyword;
    case 'range':
      return describeRange(node);
    case 'literal':
      return node.type === 'number' ? node.value : JSON.stringify(node.value);
    case 'class':
      return node.name;
    case 'collection':
      return node.keyword;
    case 'shape':
      return node.keyword === 'object' ? 'object shape' : 'array shape';
    case 'array':
      return 'array postfix';
    case 'union':
      return 'union';
    case 'intersection':
      return 'intersection';
    case 'generic':
      return `${node.name}<...>`;
    case 'callable':
      return 'callable';
    case 'unsupported':
      return node.raw;
    default:
      return 'unknown';
  }
}

export function cannotBuild(
  node: TypeNode,
  message?: string,
  typeDescription?: string,
): never {
  const desc = typeDescription ?? describeNode(node);
  throw new GenerationError(
    message ??
      `Cannot generate a runtime check for ${desc}: not representable as a supported boolean assertion in this generator`,
    desc,
  );
}
