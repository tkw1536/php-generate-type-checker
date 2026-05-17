import { describe, expect, it } from 'vitest';
import {
  andExpr,
  callExpr,
  failIfStmt,
  notExpr,
  orExpr,
  refArg,
  returnStmt,
  variableRef,
} from '../ir/';
import type { CheckerProgram } from '../ir/types.ts';
import { renderExpr, renderProgramBody } from './php.ts';

const $v = variableRef('$value');

function program(body: CheckerProgram['body']): CheckerProgram {
  return { parameter: '$value', body };
}

describe('renderExpr', () => {
  it('renders calls and refs', () => {
    expect(
      renderExpr(callExpr('is_int', [refArg($v)])),
    ).toBe('is_int($value)');
  });

  it('wraps not over bin, and, and or', () => {
    const empty = { kind: 'literal' as const, value: '[]' };
    expect(renderExpr(notExpr(callExpr('is_array', [refArg($v)])))).toBe(
      '!is_array($value)',
    );
    expect(
      renderExpr(
        notExpr(
          andExpr([
            callExpr('is_string', [refArg($v)]),
            callExpr('is_string', [refArg($v)]),
          ]),
        ),
      ),
    ).toBe('!(is_string($value) && is_string($value))');
    expect(renderExpr(notExpr(callExpr('is_int', [refArg($v)])))).toBe(
      '!is_int($value)',
    );
    expect(
      renderExpr(
        notExpr(
          orExpr([
            callExpr('is_int', [refArg($v)]),
            callExpr('is_string', [refArg($v)]),
          ]),
        ),
      ),
    ).toBe('!(is_int($value) || is_string($value))');
    expect(
      renderExpr(notExpr({ kind: 'bin', op: '===', left: refArg($v), right: empty })),
    ).toBe('!($value === [])');
  });

  it('renders call_checker with and without self::', () => {
    const e = { kind: 'call_checker' as const, name: 'isFoo', subject: $v };
    expect(renderExpr(e)).toBe('isFoo($value)');
    expect(renderExpr(e, { useSelfCalls: true })).toBe('self::isFoo($value)');
  });
});

describe('renderProgramBody', () => {
  it('renders consecutive fail-if guards as separate ifs', () => {
    const body = program([
      failIfStmt(callExpr('is_array', [refArg($v)])),
      failIfStmt(callExpr('is_callable', [refArg($v)])),
      returnStmt({ kind: 'bool', value: true }),
    ]);
    expect(renderProgramBody(body)).toBe(
      `    if (!is_array($value)) {
        return false;
    }
    if (!is_callable($value)) {
        return false;
    }
    return true;`,
    );
  });

  it('renders merged fail-if or-chain', () => {
    const body = program([
      {
        kind: 'if',
        cond: {
          kind: 'or',
          exprs: [
            notExpr(callExpr('is_string', [refArg(variableRef('$key1'))])),
            notExpr(callExpr('is_string', [refArg(variableRef('$value1'))])),
          ],
        },
        body: [{ kind: 'return', expr: { kind: 'bool', value: false } }],
      },
    ]);
    expect(renderProgramBody(body)).toBe(
      `    if (
        !is_string($key1) ||
        !is_string($value1)
    ) {
        return false;
    }`,
    );
  });

  it('wraps top-level return and/or in parentheses', () => {
    expect(
      renderProgramBody(
        program([
          returnStmt(
            andExpr([
              callExpr('is_array', [refArg($v)]),
              callExpr('is_callable', [refArg($v)]),
            ]),
          ),
        ]),
      ),
    ).toBe('    return (is_array($value) && is_callable($value));');

    expect(
      renderProgramBody(
        program([
          returnStmt(
            orExpr([
              callExpr('is_int', [refArg($v)]),
              callExpr('is_string', [refArg($v)]),
            ]),
          ),
        ]),
      ),
    ).toBe('    return (is_int($value) || is_string($value));');
  });

  it('renders foreach with keyed binding', () => {
    const body = program([
      {
        kind: 'foreach',
        iterable: $v,
        keyVar: '$key1',
        valueVar: '$value1',
        body: [returnStmt({ kind: 'bool', value: true })],
      },
    ]);
    expect(renderProgramBody(body)).toBe(
      `    foreach ($value as $key1 => $value1) {
        return true;
    }`,
    );
  });
});
