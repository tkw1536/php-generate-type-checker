import type { Block, CheckerProgram, Stmt, ValueRef } from '../ir/types.ts';
import { phpArrayKeyLiteral } from '../phpArrayKey.ts';

const PHP_RESERVED_OBJECT_PROPERTIES = new Set([
  'class',
  'function',
  'public',
  'protected',
  'private',
  'static',
  'abstract',
  'final',
  'interface',
  'trait',
  'extends',
  'implements',
  'namespace',
  'use',
  'const',
  'var',
  'new',
  'clone',
  'instanceof',
  'insteadof',
  'as',
  'try',
  'catch',
  'finally',
  'throw',
  'if',
  'else',
  'elseif',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'yield',
  'match',
  'enum',
]);

/** Names that may appear bare after `->` (PHP identifier; keywords still braced). */
const PHP_BARE_PROPERTY_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/u;

function phpQuotedString(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll('\'', "\\'")}'`;
}

function needsBracedPropertyAccess(name: string): boolean {
  return (
    PHP_RESERVED_OBJECT_PROPERTIES.has(name) ||
    !PHP_BARE_PROPERTY_NAME.test(name)
  );
}

function arrayIndexExpr(key: string | number): string {
  return phpArrayKeyLiteral(key);
}

/** PHP literal for a shape key in `array_key_exists` / `property_exists` args. */
export function phpStringLiteral(key: string | number): string {
  return phpArrayKeyLiteral(key);
}

/**
 * Map IR temporary ids to PHP names from foreach roles.
 * Sole key/item in a program → `$key` / `$item`; otherwise `$key1`, `$item2`, …
 * in foreach encounter order (1-based).
 */
export function assignTempNames(
  program: CheckerProgram,
): ReadonlyMap<number, string> {
  const keys: number[] = [];
  const items: number[] = [];

  function walkBlock(block: Block): void {
    for (const stmt of block) {
      walkStmt(stmt);
    }
  }

  function walkStmt(stmt: Stmt): void {
    switch (stmt.kind) {
      case 'if':
        walkBlock(stmt.body);
        break;
      case 'foreach':
        if (stmt.keyVar !== null) {
          keys.push(stmt.keyVar);
        }
        items.push(stmt.valueVar);
        walkBlock(stmt.body);
        break;
      case 'return':
        break;
      default:
        throw new Error('never reached');
    }
  }

  walkBlock(program.body);
  const names = new Map<number, string>();
  assignRoleNames(names, keys, 'key');
  assignRoleNames(names, items, 'item');
  return names;
}

function assignRoleNames(
  names: Map<number, string>,
  ids: readonly number[],
  role: 'key' | 'item',
): void {
  if (ids.length === 0) {
    return;
  }
  if (ids.length === 1) {
    names.set(ids[0], `$${role}`);
    return;
  }
  for (let i = 0; i < ids.length; i++) {
    names.set(ids[i], `$${role}${i + 1}`);
  }
}

/** PHP name for an IR temporary using {@link assignTempNames} (fallback `$tmpN`). */
export function renderTempVar(
  id: number,
  tempNames?: ReadonlyMap<number, string>,
): string {
  return tempNames?.get(id) ?? `$tmp${id}`;
}

/** Render a {@link ValueRef} to a PHP lvalue path. */
export function renderValueRef(
  ref: ValueRef,
  tempNames?: ReadonlyMap<number, string>,
): string {
  switch (ref.kind) {
    case 'parameter':
      return '$value';
    case 'variable':
      return renderTempVar(ref.id, tempNames);
    case 'array_access':
      // Chained [] / -> needs no parentheses in PHP.
      return `${renderValueRef(ref.object, tempNames)}[${arrayIndexExpr(ref.key)}]`;
    case 'property_access': {
      const object = renderValueRef(ref.object, tempNames);
      if (needsBracedPropertyAccess(ref.name)) {
        return `${object}->{${phpQuotedString(ref.name)}}`;
      }
      return `${object}->${ref.name}`;
    }
    default:
      throw new Error('never reached');
  }
}
