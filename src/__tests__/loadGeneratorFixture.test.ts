import { describe, expect, it } from 'vitest';
import { trimBlankLines } from './fixtureFormat.ts';
import {
  parseGeneratorFixture,
  stripPhpOpeningTag,
} from './loadGeneratorFixture.ts';

describe('parseGeneratorFixture', () => {
  it('parses input and body, ignoring <?php marker', () => {
    const fixture = parseGeneratorFixture(
      `---
input: int
---
<?php
    return true;

`,
      'test.fixture',
    );
    expect(fixture.input).toBe('int');
    expect(fixture.expectedBody).toBe('    return true;');
    expect(fixture.expectsError).toBe(false);
  });

  it('trims leading and trailing blank lines from body', () => {
    const fixture = parseGeneratorFixture(
      `---
input: "foo"
---

<?php

    return false;

`,
      'blank.fixture',
    );
    expect(fixture.expectedBody).toBe('    return false;');
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
