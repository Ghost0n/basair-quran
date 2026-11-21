"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icon";
import { t } from "@/lib/i18n";

/**
 * Copies a chat message (the question, or the answer with its ayahs): a small
 * button under the message that says «نُسخ» for a moment once it worked, and
 * «تعذّر النسخ» when the browser refused.
 */
export function CopyButton({ text, label }: { text: () => string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = window.setTimeout(() => setState("idle"), 1600);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text());
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  const shown = state === "copied" ? t("نُسخ") : state === "failed" ? t("تعذّر النسخ") : label;
  return (
    <button
      type="button"
      className={`qb-msg-copy${state === "copied" ? " is-done" : ""}`}
      onClick={() => void copy()}
      aria-label={label}
      title={label}
    >
      <Icon name={state === "copied" ? "check" : "copy"} size={13} />
      <span aria-live="polite">{shown}</span>
    </button>
  );
}
