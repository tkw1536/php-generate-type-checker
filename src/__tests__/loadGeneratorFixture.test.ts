import { describe, expect, it } from 'vitest';
import { trimBlankLines } from './fixtureFormat.ts';
import {
  parseGeneratorFixture,
  stripPhpOpeningTag,
} from './loadGeneratorFixture.ts';

describe('parseGeneratorFixture', () => {
  it('parses input and expected output, ignoring <?php marker', () => {
    const fixture = parseGeneratorFixture(
      `---
input: int
---
<?php

/**
 * @param mixed $data
 * @phpstan-assert-if-true int $data
 */
function checkType(mixed $data): bool
{
    return true;
}

`,
      'test.fixture',
    );
    expect(fixture.input).toBe('int');
    expect(fixture.output).toBe('function');
    expect(fixture.expected).toBe(`/**
 * @param mixed $data
 * @phpstan-assert-if-true int $data
 */
function checkType(mixed $data): bool
{
    return true;
}
`);
    expect(fixture.expectsError).toBe(false);
  });

  it('reads output mode from frontmatter', () => {
    const fixture = parseGeneratorFixture(
      `---
input: int
output: public_static
---
<?php
class X {}
`,
      'mode.fixture',
    );
    expect(fixture.output).toBe('public_static');
  });

  it('trims leading and trailing blank lines from expected', () => {
    const fixture = parseGeneratorFixture(
      `---
input: "foo"
output: function
---

<?php

/**
 * @param mixed $data
 * @phpstan-assert-if-true foo $data
 */
function checkType(mixed $data): bool
{
    return false;
}

`,
      'blank.fixture',
    );
    expect(fixture.expected).toBe(`/**
 * @param mixed $data
 * @phpstan-assert-if-true foo $data
 */
function checkType(mixed $data): bool
{
    return false;
}
`);
  });

  it('detects error fixtures from frontmatter', () => {
    const fixture = parseGeneratorFixture(
      `---
input: "callable(int): void"
error: generation
---
<?php
`,
      'err.fixture',
    );
    expect(fixture.expectsError).toBe(true);
    expect(fixture.output).toBe('function');
  });
});

describe('stripPhpOpeningTag', () => {
  it('removes only a leading <?php line', () => {
    expect(stripPhpOpeningTag('<?php\n$a = 1;')).toBe('$a = 1;');
    expect(stripPhpOpeningTag('$a = 1;')).toBe('$a = 1;');
  });
});

describe('trimBlankLines', () => {
  it('strips blank lines at both ends', () => {
    expect(trimBlankLines('\n\n  code\n\n')).toBe('  code');
  });
});
