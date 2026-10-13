/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest';
import { fillSiteFooter } from './siteFooter.ts';

function footerMeta(): HTMLElement {
  document.body.innerHTML = '<span id="site-footer-meta"></span>';
  return document.querySelector<HTMLElement>('#site-footer-meta')!;
}

function linksCommitShaWhenPresent(): void {
  const meta = footerMeta();
  fillSiteFooter(meta, 'abc1234', '2026-10-13T19:55:00.000Z');

  expect(meta.textContent).toContain('Built 2026-10-13 19:55 UTC;');
  expect(meta.textContent).toContain('Source for version abc1234 on GitHub');
  expect(meta.textContent).toContain('By @tkw1536');

  const links = [...meta.querySelectorAll('a')];
  expect(links).toHaveLength(2);
  const [sourceLink, authorLink] = links;
  expect(sourceLink.href).toContain(
    '/tkw1536/php-generate-type-checker/tree/abc1234',
  );
  expect(sourceLink.textContent).toContain(
    'Source for version abc1234 on GitHub',
  );
  expect(authorLink.href).toBe('https://github.com/tkw1536');
  expect(authorLink.textContent).toContain('@tkw1536');
}

function fallsBackToRepoLinkWithoutSha(): void {
  const meta = footerMeta();
  fillSiteFooter(meta, '', '2026-01-02T03:04:05.000Z');

  expect(meta.textContent).toContain('Built 2026-01-02 03:04 UTC;');
  expect(meta.textContent).toContain('Source on GitHub');
  expect(meta.textContent).not.toContain('version');

  const links = [...meta.querySelectorAll('a')];
  expect(links).toHaveLength(2);
  const [sourceLink, authorLink] = links;
  expect(sourceLink.href).toBe(
    'https://github.com/tkw1536/php-generate-type-checker',
  );
  expect(sourceLink.textContent).toContain('Source on GitHub');
  expect(authorLink.href).toBe('https://github.com/tkw1536');
}

describe('siteFooter', () => {
  it('links the commit SHA when present', linksCommitShaWhenPresent);
  it('falls back to the repo GitHub link without a SHA', fallsBackToRepoLinkWithoutSha);
});
