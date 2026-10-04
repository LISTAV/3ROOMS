/**
 * Centralized keyboard guard helper.
 * Determines whether user is actively typing within a text input,
 * textarea, select element, or contentEditable container.
 */
export function isInputElementActive(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement;
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    (el as HTMLElement).isContentEditable === true
  );
}
