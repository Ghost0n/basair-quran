"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import "./select-menu.css";

import { Icon } from "./icon";

export type SelectOption = { value: string; label: string };

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "down" | "up";
};

/**
 * Themed dropdown — a button + popover listbox that replaces native <select>
 * so the open list matches the gold-on-charcoal theme (native option lists
 * can't be styled cross-browser). The list is portalled to <body> with fixed
 * positioning so it's never clipped by a scrolling/overflow-hidden parent
 * (e.g. the Tweaks panel) and flips up near the viewport bottom. Keyboard +
 * ARIA complete.
 */
export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  placeholder = "",
  className = "",
  disabled = false,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const selected = options.find((option) => option.value === value);
  const label = selected ? selected.label : placeholder;

  // Position the portalled list against the trigger; flip up when low.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const up = spaceBelow < 220 && spaceAbove > spaceBelow;
    setPosition({
      top: up ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(320, Math.max(140, up ? spaceAbove : spaceBelow)),
      placement: up ? "up" : "down",
    });
  }, [open]);

  // Close on outside pointer, ancestor/page scroll, resize, or Escape.
  useLayoutEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onScroll(event: Event) {
      // The scroll listener is capture-phase (to catch scrolls on any ancestor,
      // since the list is fixed-positioned and would otherwise detach from its
      // trigger). Scrolling INSIDE the list must NOT close it, so skip events
      // originating within the list itself.
      const target = event.target as Node | null;
      if (target && listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open && activeIndex >= 0) {
      const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
      node?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex]);

  function openMenu() {
    if (disabled) return;
    setOpen(true);
    setActiveIndex(Math.max(0, options.findIndex((option) => option.value === value)));
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => Math.min(options.length - 1, index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, index - 1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const option = options[activeIndex];
        if (option) choose(option.value);
        break;
      }
      default:
        break;
    }
  }

  const list =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <ul
            className="qb-select-list"
            role="listbox"
            aria-label={ariaLabel}
            ref={listRef}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              minWidth: position.width,
              maxHeight: position.maxHeight,
              transform: position.placement === "up" ? "translateY(-100%)" : undefined,
            }}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  className={`qb-select-opt${isSelected ? " selected" : ""}${index === activeIndex ? " active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option.value);
                  }}
                >
                  {isSelected ? <Icon name="check" size={13} /> : <span className="qb-select-check" />}
                  <span className="qb-select-opt-label">{option.label}</span>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className={`qb-select ${className}`.trim()}>
      <button
        type="button"
        ref={triggerRef}
        className="qb-select-btn"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
      >
        <span className="qb-select-label">{label}</span>
        <Icon name="chevDown" size={14} />
      </button>
      {list}
    </div>
  );
}
