/**
 * Hiding is deliberately reversible and deliberately local: it only changes
 * what this tab renders. Anything stronger would be a lie about a feature the
 * platforms do not expose.
 */

const HIDDEN_ATTR = 'data-chat-sweep-hidden';

export type Restore = () => void;

export function hide(elements: readonly HTMLElement[]): Restore {
  const touched: HTMLElement[] = [];
  const previous = new Map<HTMLElement, string>();

  for (const element of elements) {
    if (element.hasAttribute(HIDDEN_ATTR)) continue;
    previous.set(element, element.style.display);
    element.setAttribute(HIDDEN_ATTR, '1');
    element.style.display = 'none';
    touched.push(element);
  }

  return () => {
    for (const element of touched) {
      const restored = previous.get(element) ?? '';
      if (restored === '') {
        element.style.removeProperty('display');
        if (element.getAttribute('style') === '') element.removeAttribute('style');
      } else {
        element.style.display = restored;
      }
      element.removeAttribute(HIDDEN_ATTR);
    }
  };
}
