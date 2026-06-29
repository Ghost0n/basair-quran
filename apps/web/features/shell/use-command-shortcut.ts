"use client";

import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Wires the global `⌘K` / `Ctrl+K` / `/` shortcut. Focuses the element
 * with `data-qb-command-input` and selects its contents.
 *
 * `/` only fires when the user is NOT already typing in another input.
 */
export function useCommandShortcut(): void {
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      const isMeta = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !isTypingTarget(event.target);

      if (!isMeta && !isSlash) return;

      const input = document.querySelector<HTMLInputElement>("[data-qb-command-input]");
      if (!input) return;

      event.preventDefault();
      input.focus();
      input.select();
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
