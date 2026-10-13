import { APP_BUILD_TIME, APP_GIT_SHA } from '../buildInfo.ts';

const REPO_URL = 'https://github.com/tkw1536/php-generate-type-checker';
const AUTHOR_URL = 'https://github.com/tkw1536';
const OPENS_NEW_TAB = ' (opens in new tab)';

function formatBuildTimeUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const h = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min} UTC`;
}

function externalLink(
  href: string,
  ...children: ReadonlyArray<string | Node>
): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.append(...children);
  const hidden = document.createElement('span');
  hidden.className = 'visually-hidden';
  hidden.textContent = OPENS_NEW_TAB;
  a.append(hidden);
  return a;
}

/** Fill the footer meta slot from baked build info. */
export function fillSiteFooter(
  metaEl: HTMLElement,
  gitSha: string,
  buildTimeIso: string,
): void {
  metaEl.replaceChildren();
  metaEl.append(`Built ${formatBuildTimeUtc(buildTimeIso)}; `);
  if (gitSha === '') {
    metaEl.append(externalLink(REPO_URL, 'Source on GitHub'));
  } else {
    metaEl.append(
      externalLink(
        `${REPO_URL}/tree/${gitSha}`,
        `Source for version ${gitSha} on GitHub`,
      ),
    );
  }
  metaEl.append('. By ');
  metaEl.append(externalLink(AUTHOR_URL, '@tkw1536'));
  metaEl.append('.');
}

/** Wire `#site-footer-meta` from Vite-baked build info. */
export function setupSiteFooter(): void {
  const metaEl = document.querySelector<HTMLElement>('#site-footer-meta');
  if (metaEl === null) {
    return;
  }
  fillSiteFooter(metaEl, APP_GIT_SHA, APP_BUILD_TIME);
}
