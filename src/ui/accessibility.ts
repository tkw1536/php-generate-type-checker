/**
 * Ensures each help (?) button has aria-describedby pointing at an existing
 * element so tooltip text is available to assistive technology.
 */
export function setupHelpTooltips(): void {
  const helpButtons = document.querySelectorAll<HTMLButtonElement>('.option-help');

  for (const button of helpButtons) {
    const describedBy = button.getAttribute('aria-describedby');
    if (!describedBy) {
      console.warn(
        'Accessibility: .option-help button is missing aria-describedby',
        button,
      );
      continue;
    }

    const description = document.querySelector(`#${describedBy}`);
    if (!description) {
      console.warn(
        `Accessibility: aria-describedby="#${describedBy}" target not found`,
        button,
      );
      continue;
    }

    // Prefer data-tooltip as the single source of truth for description text.
    const tooltip = button.dataset.tooltip;
    if (tooltip && description.textContent !== tooltip) {
      description.textContent = tooltip;
    }
  }
}
