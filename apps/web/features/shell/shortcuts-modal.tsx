"use client";

import "./shortcuts-modal.css";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icon";
import { modKey } from "@/lib/platform";

import { t } from "@/lib/i18n";

// U2: platform-aware shortcuts — computed at call time (client-only, "use client").
function getShortcuts(): { keys: string[]; label: string }[] {
  return [
    { keys: [modKey(), "K"], label: t("فتح شريط الأوامر") },
    { keys: ["/"], label: t("فتح شريط الأوامر") },
    { keys: ["?"], label: t("عرض اختصارات لوحة المفاتيح") },
    { keys: ["Esc"], label: t("إغلاق النوافذ المنبثقة") },
  ];
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Keyboard shortcuts cheat-sheet — opened with `?` from anywhere outside
 * a text field, closed with Esc.
 */
export function ShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key === "?" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setOpen(true);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return null;

  return (
    <div className="qb-shortcuts-backdrop" onClick={() => setOpen(false)}>
      <div className="qb-shortcuts-modal" role="dialog" aria-label={t("اختصارات لوحة المفاتيح")} onClick={(e) => e.stopPropagation()}>
        <div className="head">
          <h3>{t("اختصارات لوحة المفاتيح")}</h3>
          <button type="button" className="x" onClick={() => setOpen(false)} aria-label={t("إغلاق")}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className="qb-shortcuts-list">
          {getShortcuts().map((shortcut) => (
            <div key={shortcut.label + shortcut.keys.join()} className="qb-shortcut-row">
              <span>{shortcut.label}</span>
              <span className="keys">
                {shortcut.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
