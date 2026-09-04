import {
  getActiveOutputTab,
  isOutputTabId,
  setActiveOutputTab,
  syncCopyButton,
  type OutputTabId,
} from './outputPanel.ts';

export function activateOutputTab(
  tabId: OutputTabId,
  options?: { readonly focus?: boolean },
): void {
  const tabButtons = document.querySelectorAll<HTMLButtonElement>(
    '.output-tab[data-output-tab]',
  );
  const tabPanels = document.querySelectorAll<HTMLElement>(
    '.output-tab-panel[data-output-panel]',
  );

  setActiveOutputTab(tabId);

  tabButtons.forEach((btn) => {
    const active = btn.dataset.outputTab === tabId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.tabIndex = active ? 0 : -1;
    if (active && options?.focus === true) {
      btn.focus();
    }
  });

  tabPanels.forEach((panel) => {
    const active = panel.dataset.outputPanel === tabId;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
    panel.tabIndex = active ? 0 : -1;
  });

  syncCopyButton();
}

export function setupOutputTabs(): void {
  const tablist = document.querySelector<HTMLElement>('.output-tabs');
  const tabButtons = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '.output-tab[data-output-tab]',
    ),
  ];

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tabId = button.dataset.outputTab;
      if (tabId === undefined || tabId === '' || !isOutputTabId(tabId)) {
        return;
      }
      activateOutputTab(tabId);
    });
  });

  tablist?.addEventListener('keydown', (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLButtonElement) ||
      target.dataset.outputTab === undefined ||
      target.dataset.outputTab === ''
    ) {
      return;
    }

    const currentIndex = tabButtons.indexOf(target);
    if (currentIndex < 0) {
      return;
    }

    let nextIndex: number | undefined;

    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
        break;
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabButtons.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabButtons.length - 1;
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const tabId = target.dataset.outputTab;
        if (tabId !== undefined && tabId !== '' && isOutputTabId(tabId)) {
          activateOutputTab(tabId);
        }
        return;
      }
      default:
        return;
    }

    if (nextIndex === undefined) {
      return;
    }

    event.preventDefault();
    const nextTab = tabButtons[nextIndex];
    if (nextTab === undefined) {
      return;
    }
    // Manual activation: move focus only; activate with Enter/Space or click.
    nextTab.focus();
  });

  activateOutputTab(getActiveOutputTab());
}
