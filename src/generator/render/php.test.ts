import { describe, expect, it } from 'vitest';
import {
  andExpr,
  binExpr,
  callExpr,
  failIfStmt,
  literalArg,
  notExpr,
  orExpr,
  refArg,
  returnStmt,
  parameterRef,
  variableRef,
} from '../ir/';
import type { CheckerProgram } from '../ir/types.ts';
import { renderProgramBody } from './php.ts';
import { renderExpr } from "./phpExpr.ts";

const $v = parameterRef();

function program(body: CheckerProgram['body']): CheckerProgram {
  return { body };
}

function rendersCallsAndRefs(): void {
  expect(renderExpr(callExpr('is_int', [refArg($v)]))).toBe('is_int($value)');
}

function wrapsNotOverBinAndOr(): void {
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
    renderExpr(
      notExpr({ kind: 'bin', op: '===', left: refArg($v), right: empty }),
    ),
  ).toBe('!($value === [])');
}

function rendersBoolAndNullLiterals(): void {
  expect(renderExpr({ kind: 'bool', value: true })).toBe('TRUE');
  expect(renderExpr({ kind: 'bool', value: false })).toBe('FALSE');
  expect(
    renderExpr({
      kind: 'bin',
      op: '===',
      left: refArg($v),
      right: { kind: 'literal', value: 'null' },
    }),
  ).toBe('$value === NULL');
}

function rendersCallCheckerWithAndWithoutSelf(): void {
  const e = { kind: 'call_checker' as const, name: 'isFoo', subject: $v };
  expect(renderExpr(e)).toBe('isFoo($value)');
  expect(renderExpr(e, { useSelfCalls: true })).toBe('self::isFoo($value)');
}

function rendersConsecutiveFailIfGuards(): void {
  const body = program([
    failIfStmt(callExpr('is_array', [refArg($v)])),
    failIfStmt(callExpr('is_callable', [refArg($v)])),
    returnStmt({ kind: 'bool', value: true }),
  ]);
  expect(renderProgramBody(body)).toBe(
    `    if (!is_array($value)) {
        return FALSE;
    }
    if (!is_callable($value)) {
        return FALSE;
    }
    return TRUE;`,
  );
}

function rendersMergedFailIfOrChain(): void {
  const body = program([
    {
      kind: 'foreach',
      iterable: $v,
      keyVar: 1,
      valueVar: 0,
      body: [
        {
          kind: 'if',
          cond: {
            kind: 'or',
            exprs: [
              notExpr(callExpr('is_string', [refArg(variableRef(1))])),
              notExpr(callExpr('is_string', [refArg(variableRef(0))])),
            ],
          },
          body: [{ kind: 'return', expr: { kind: 'bool', value: false } }],
        },
      ],
    },
  ]);
  expect(renderProgramBody(body)).toBe(
    `    foreach ($value as $key => $item) {
        if (
            !is_string($key) ||
            !is_string($item)
        ) {
            return FALSE;
        }
    }`,
  );
}

function wrapsTopLevelReturnAndOr(): void {
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
}

function wrapsLongLeafAndChains(): void {
  expect(
    renderProgramBody(
      program([
        returnStmt(
          andExpr([
            callExpr('is_array', [refArg($v)]),
            callExpr('is_callable', [refArg($v)]),
            callExpr('is_object', [refArg($v)]),
          ]),
        ),
      ]),
    ),
  ).toBe(
    `    return (
        is_array($value) &&
        is_callable($value) &&
        is_object($value)
    );`,
  );
}

function wrapsNestedCompoundOperandOnce(): void {
  expect(
    renderProgramBody(
      program([
        returnStmt(
          andExpr([
            callExpr('is_array', [refArg($v)]),
            orExpr([
              notExpr(
                callExpr('array_key_exists', [
                  literalArg("'timeout'"),
                  refArg($v),
                ]),
              ),
              andExpr([
                callExpr('is_int', [refArg($v)]),
                binExpr('>', refArg($v), literalArg('0')),
              ]),
            ]),
          ]),
        ),
      ]),
    ),
  ).toBe(
    `    return (
        is_array($value) &&
        (
            !array_key_exists('timeout', $value) ||
            (
                is_int($value) &&
                $value > 0
            )
        )
    );`,
  );
}

function rendersForeachWithKeyedBinding(): void {
  const body = program([
    {
      kind: 'foreach',
      iterable: $v,
      keyVar: 1,
      valueVar: 0,
      body: [returnStmt({ kind: 'bool', value: true })],
    },
  ]);
  expect(renderProgramBody(body)).toBe(
    `    foreach ($value as $key => $item) {
        return TRUE;
    }`,
  );
}

function numbersNestedForeachItems(): void {
  const body = program([
    {
      kind: 'foreach',
      iterable: $v,
      keyVar: null,
      valueVar: 0,
      body: [
        {
          kind: 'foreach',
          iterable: variableRef(0),
          keyVar: null,
          valueVar: 1,
          body: [
            failIfStmt(callExpr('is_string', [refArg(variableRef(1))])),
            returnStmt({ kind: 'bool', value: true }),
          ],
        },
      ],
    },
  ]);
  expect(renderProgramBody(body)).toBe(
    `    foreach ($value as $item1) {
        foreach ($item1 as $item2) {
            if (!is_string($item2)) {
                return FALSE;
            }
            return TRUE;
        }
    }`,
  );
}

describe('renderExpr', () => {
  it('renders calls and refs', rendersCallsAndRefs);
  it('wraps not over bin, and, and or', wrapsNotOverBinAndOr);
  it('renders bool and null literals uppercase', rendersBoolAndNullLiterals);
  it(
    'renders call_checker with and without self::',
    rendersCallCheckerWithAndWithoutSelf,
  );
});

describe('renderProgramBody', () => {
  it(
    'renders consecutive fail-if guards as separate ifs',
    rendersConsecutiveFailIfGuards,
  );
  it('renders merged fail-if or-chain', rendersMergedFailIfOrChain);
  it('wraps top-level return and/or in parentheses', wrapsTopLevelReturnAndOr);
  it('wraps return && chains with 3+ leaf operands', wrapsLongLeafAndChains);
  it(
    'wraps nested compound &&/|| operands once',
    wrapsNestedCompoundOperandOnce,
  );
  it('renders foreach with keyed binding', rendersForeachWithKeyedBinding);
  it('numbers nested foreach items', numbersNestedForeachItems);
});
