import { useEffect, useRef } from "react";

import { canHover } from "./can-hover";

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;
const isButtonLike = (item: HTMLElement) =>
  item instanceof HTMLInputElement && ["button", "submit", "checkbox", "radio", "range"].includes(item.type);

/**
 * Modal-dialog accessibility, in one place:
 *  • traps Tab focus inside the dialog,
 *  • closes on Escape,
 *  • moves focus into the dialog on open and restores it to the previously
 *    focused element on close.
 *
 * Attach the returned ref to the dialog container and give it `tabIndex={-1}`
 * (fallback focus target) plus `role="dialog"` + `aria-modal="true"`.
 */
export function useDialog<T extends HTMLElement>(onClose: () => void, { enabled = true }: { enabled?: boolean } = {}) {
  const ref = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Respect an element that already took focus on mount (e.g. an autoFocus
    // search field); otherwise focus the first focusable, else the dialog.
    if (!node || !node.contains(document.activeElement)) {
      let focusables = node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
      // On touch screens a text field taking focus pops the keyboard over the dialog.
      if (!canHover()) focusables = focusables.filter((item) => !TYPING.test(item.tagName) || isButtonLike(item));
      (focusables[0] ?? node)?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [enabled]);

  return ref;
}
