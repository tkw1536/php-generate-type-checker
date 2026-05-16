import type { TypeNode } from '../../parser/ast.ts';

function describeIntRange(node: { min?: number; max?: number }): string {
  if (node.min === undefined && node.max === undefined) {
    return 'int';
  }
  const lo = node.min === undefined ? 'min' : String(node.min);
  const hi = node.max === undefined ? 'max' : String(node.max);
  return `int<${lo}, ${hi}>`;
}

export function describeNode(node: TypeNode): string {
  switch (node.kind) {
    case 'primitive':
      return node.name;
    case 'int_range':
      return describeIntRange(node);
    case 'literal':
      return JSON.stringify(node.value);
    case 'class':
      return node.name;
    case 'array':
      return 'array';
    case 'list':
      return 'list';
    case 'shape':
      return node.object ? 'object shape' : 'array shape';
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
