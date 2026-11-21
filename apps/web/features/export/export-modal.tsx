"use client";

import "./export.css";

import { useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import { useDialog } from "@/lib/use-dialog";
import { textDirection } from "@/features/studio/chat-markdown";
import { ChatMarkdown } from "@/features/studio/chat-markdown-view";
import { TAFSSIR_DISCLAIMER_TEXT } from "@/features/studio/tafssir-disclaimer";
import type { StudioSession } from "@/features/studio/use-studio-sessions";

import { t } from "@/lib/i18n";

type ExportFormat = "md" | "json";

/**
 * Export modal — shares a Studio session as Markdown or JSON, with the
 * cited verses. Export runs fully client-side (Blob download); the former
 * explanatory reading's disclaimer travels in every export of such a session.
 */
export function ExportModal({ session, onClose }: { session: StudioSession; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>("md");
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  const content = useMemo(() => buildExport(session, format), [session, format]);

  function download() {
    const blob = new Blob([content], {
      type: format === "json" ? "application/json" : "text/markdown",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `qbasair-session.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
    onClose();
  }

  return (
    <div className="qb-export-backdrop" onClick={onClose}>
      <div
        className="qb-export-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("تصدير الجلسة")}
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="qb-export-head">
          <div>
            <div className="kicker">{t("التصدير")}</div>
            <h3>{session.title}</h3>
          </div>
          <button type="button" className="x" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="qb-export-body">
          <div className="qb-export-section-label">{t("الصيغة")}</div>
          <div className="qb-export-formats">
            <button
              type="button"
              className={`qb-export-format${format === "md" ? " active" : ""}`}
              onClick={() => setFormat("md")}
            >
              <Icon name="feather" size={14} /> Markdown
            </button>
            <button
              type="button"
              className={`qb-export-format${format === "json" ? " active" : ""}`}
              onClick={() => setFormat("json")}
            >
              <Icon name="layers" size={14} /> JSON
            </button>
          </div>

          <div className="qb-export-section-label">{t("معاينة")}</div>
          {/* Markdown shows as it reads once opened (headings, quotes, lists);
              JSON as its text. */}
          {format === "md" ? (
            <div className="qb-export-preview is-rendered" dir={textDirection(content)}>
              <ChatMarkdown source={content} />
            </div>
          ) : (
            <div className="qb-export-preview">{content.slice(0, 1200)}</div>
          )}
        </div>

        <div className="qb-export-foot">
          <button type="button" onClick={onClose}>
            {t("إلغاء")}
          </button>
          <button type="button" className="primary" onClick={download}>
            {t("تصدير")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The session as text: the cited verses always; a session of the former
 * explanatory reading always carries its disclaimer (it must never travel
 * without it).
 */
export function buildExport(session: StudioSession, format: ExportFormat): string {
  const disclaimer = session.mode === "tafssir";
  if (format === "json") {
    return JSON.stringify(
      {
        title: session.title,
        mode: session.mode,
        disclaimer: disclaimer ? TAFSSIR_DISCLAIMER_TEXT : undefined,
        messages: session.messages.map((message) => ({
          role: message.role,
          content: message.content,
          evidence:
            message.response
              ? message.response.ayahs.map((ayah) => ({
                  surah: ayah.surah,
                  ayah: ayah.ayah,
                  text: ayah.text,
                }))
              : undefined,
        })),
      },
      null,
      2,
    );
  }

  const lines: string[] = [`# ${session.title}`, ""];
  // There are no modes any more: only a session of the former explanatory
  // reading says what it is, with its disclaimer.
  if (disclaimer) {
    lines.push(t("> الوضع: {0}", { 0: t("قراءة تفسيرية") }), "");
    lines.push(`> ${t(TAFSSIR_DISCLAIMER_TEXT)}`, "");
  }

  for (const message of session.messages) {
    if (message.role === "user") {
      lines.push(t("## السؤال"), "", message.content, "");
    } else {
      lines.push(t("## الجواب"), "", message.content, "");
      if (message.response && message.response.ayahs.length > 0) {
        lines.push(t("### الدليل القرآني"), "");
        message.response.ayahs.forEach((ayah, index) => {
          lines.push(t("[{0}] سورة {1} · {2}", { 0: index + 1, 1: ayah.surah, 2: ayah.ayah }), `> ${ayah.text.trim()}`, "");
        });
      }
    }
  }

  lines.push("---", t("بصائر القرآن · Baṣāʾir"));
  return lines.join("\n");
}
