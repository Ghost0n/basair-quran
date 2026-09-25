"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { Icon } from "@/components/icon";

import "./tools.css";

import { READER_TOOLS, readerTool } from "./registry";
import { setReaderTool, useReaderTool } from "./use-reader-tool";

import { t } from "@/lib/i18n";

/**
 * The toolbox chooser in the reader bar. Wide screens: a segmented row of tool
 * icons (1–4). Compact: one button showing the active tool that opens a small
 * menu with each tool's hint. Both render straight from the registry.
 */
export function ToolPicker({ compact }: { compact: boolean }) {
  const active = useReaderTool();
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // The menu is portaled (the bar sits in transformed/clipped ancestors) and
  // placed from the button: upward when the bar is at the bottom (phones),
  // downward otherwise, kept inside the viewport horizontally.
  function toggleMenu() {
    const button = rootRef.current?.querySelector("button");
    if (!open && button) {
      const rect = button.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - 24);
      const left = Math.min(
        Math.max(rect.right - width, 12),
        window.innerWidth - width - 12,
      );
      const upward = rect.top > window.innerHeight / 2;
      setMenuStyle(
        upward
          ? { left, width, bottom: window.innerHeight - rect.top + 6 }
          : { left, width, top: rect.bottom + 6 },
      );
    }
    setOpen((value) => !value);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      )
        setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!compact) {
    return (
      <div className="qb-toolbox" role="radiogroup" aria-label={t("أداة القراءة")}>
        {READER_TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            role="radio"
            aria-checked={active === tool.id}
            className={`tool${active === tool.id ? " on" : ""}`}
            onClick={() => setReaderTool(tool.id)}
            aria-label={tool.label}
            title={`${tool.label} — ${tool.hint} (${tool.key})`}
          >
            <Icon name={tool.icon} size={16} />
            {active === tool.id ? (
              <span className="lbl">{tool.label}</span>
            ) : null}
          </button>
        ))}
      </div>
    );
  }

  const current = readerTool(active);
  return (
    <div className="qb-toolbox-compact" ref={rootRef}>
      <button
        type="button"
        className="act labelled on-tool"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("الأداة: {0}", { 0: current.label })}
        onClick={toggleMenu}
      >
        <Icon name={current.icon} size={18} />
        <span className="lbl">{current.label}</span>
      </button>
      {open
        ? createPortal(
            <div
              className="qb-toolbox-menu"
              role="menu"
              aria-label={t("أداة القراءة")}
              ref={menuRef}
              style={menuStyle}
            >
              {READER_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active === tool.id}
                  className={active === tool.id ? "on" : ""}
                  onClick={() => {
                    setReaderTool(tool.id);
                    setOpen(false);
                  }}
                >
                  <Icon name={tool.icon} size={18} />
                  <span className="t">{tool.label}</span>
                  <span className="d">{tool.hint}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
