import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

const scopeStack: symbol[] = [];

/** Keep keyboard focus inside an overlay and restore the trigger on dismissal. */
export function useFocusScope(
  active: Ref<boolean>,
  root: Ref<HTMLElement | null>,
  close: () => void,
  background: () => HTMLElement[],
) {
  const scopeId = Symbol('focus-scope');
  let previousFocus: HTMLElement | null = null;
  let previousOverflow = '';
  let backgrounds: Array<{ element: HTMLElement; inert: boolean }> = [];
  let engaged = false;

  const focusable = () =>
    [
      ...(root.value?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ) ?? []),
    ].filter((element) => !element.closest('[inert]') && element.getClientRects().length > 0);

  const onKeydown = (event: KeyboardEvent) => {
    if (scopeStack.at(-1) !== scopeId) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) {
        event.preventDefault();
        root.value?.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || !root.value?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !root.value?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const release = () => {
    if (!engaged) return;
    engaged = false;
    const index = scopeStack.indexOf(scopeId);
    if (index >= 0) scopeStack.splice(index, 1);
    document.removeEventListener('keydown', onKeydown);
    backgrounds.forEach(({ element, inert }) => {
      element.inert = inert;
    });
    backgrounds = [];
    document.body.style.overflow = previousOverflow;
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };

  watch(
    active,
    async (open) => {
      if (!open) return release();
      previousFocus = document.activeElement as HTMLElement | null;
      await nextTick();
      if (!active.value || !root.value) return;
      engaged = true;
      scopeStack.push(scopeId);
      backgrounds = background().map((element) => ({ element, inert: element.inert }));
      backgrounds.forEach(({ element }) => {
        element.inert = true;
      });
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onKeydown);
      (focusable()[0] ?? root.value).focus();
    },
    { immediate: true },
  );

  onBeforeUnmount(release);
}
