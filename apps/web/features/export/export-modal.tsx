"use client";

import "./export.css";

import { useMemo, useState } from "react";

import { Icon } from "@/components/icon";
import { useDialog } from "@/lib/use-dialog";
import { TAFSSIR_DISCLAIMER_TEXT } from "@/features/studio/tafssir-disclaimer";
import type { StudioSession } from "@/features/studio/use-studio-sessions";

type ExportFormat = "md" | "json";

/**
 * Export modal — shares a Studio session as Markdown or JSON. Export runs
 * fully client-side (Blob download); the Tafssir disclaimer travels in
 * every export of a tafssir session.
 *
 * PDF and DOCX are intentionally deferred — they need server-side
 * rendering dependencies (weasyprint / python-docx) that warrant a
 * dedicated review.
 */
export function ExportModal({ session, onClose }: { session: StudioSession; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>("md");
  const [includeEvidence, setIncludeEvidence] = useState(true);
  const [includeDisclaimer, setIncludeDisclaimer] = useState(true);

  // The experimental Tafssir disclaimer is MANDATORY on a tafssir export — the
  // user cannot opt out of it (safety: a tafssir reading must never travel
  // without its caveat).
  const isTafssir = session.mode === "tafssir";
  const disclaimerIncluded = isTafssir ? true : includeDisclaimer;
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  const content = useMemo(
    () => buildExport(session, format, { includeEvidence, includeDisclaimer: disclaimerIncluded }),
    [session, format, includeEvidence, disclaimerIncluded],
  );

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
        aria-label="تصدير الجلسة"
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="qb-export-head">
          <div>
            <div className="kicker">التصدير</div>
            <h3>{session.title}</h3>
          </div>
          <button type="button" className="x" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="qb-export-body">
          <div className="qb-export-section-label">الصيغة</div>
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
            <button type="button" className="qb-export-format" disabled>
              <Icon name="page" size={14} /> PDF <span className="soon">قريباً</span>
            </button>
            <button type="button" className="qb-export-format" disabled>
              <Icon name="book" size={14} /> DOCX <span className="soon">قريباً</span>
            </button>
          </div>

          <div className="qb-export-section-label">المحتوى</div>
          <div className="qb-export-toggles">
            <label className="qb-export-toggle">
              <input
                type="checkbox"
                checked={includeEvidence}
                onChange={(e) => setIncludeEvidence(e.target.checked)}
              />
              تضمين الآيات المُستدَل بها
            </label>
            {isTafssir ? (
              <label className="qb-export-toggle" title="إلزامي في الوضع التفسيري">
                <input type="checkbox" checked disabled />
                تنبيه الوضع التفسيري (إلزامي)
              </label>
            ) : (
              <label className="qb-export-toggle">
                <input
                  type="checkbox"
                  checked={includeDisclaimer}
                  onChange={(e) => setIncludeDisclaimer(e.target.checked)}
                />
                تضمين تنبيه الوضع التفسيري
              </label>
            )}
          </div>

          <div className="qb-export-section-label">معاينة</div>
          <div className="qb-export-preview">{content.slice(0, 1200)}</div>
        </div>

        <div className="qb-export-foot">
          <button type="button" onClick={onClose}>
            إلغاء
          </button>
          <button type="button" className="primary" onClick={download}>
            تصدير
          </button>
        </div>
      </div>
    </div>
  );
}

type ExportOptions = { includeEvidence: boolean; includeDisclaimer: boolean };

function buildExport(session: StudioSession, format: ExportFormat, options: ExportOptions): string {
  if (format === "json") {
    return JSON.stringify(
      {
        title: session.title,
        mode: session.mode,
        disclaimer: options.includeDisclaimer && session.mode === "tafssir" ? TAFSSIR_DISCLAIMER_TEXT : undefined,
        messages: session.messages.map((message) => ({
          role: message.role,
          content: message.content,
          evidence:
            options.includeEvidence && message.response
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
  lines.push(`> الوضع: ${session.mode === "tafssir" ? "قراءة تفسيرية" : "القرآن وحدَه"}`, "");
  if (options.includeDisclaimer && session.mode === "tafssir") {
    lines.push(`> ${TAFSSIR_DISCLAIMER_TEXT}`, "");
  }

  for (const message of session.messages) {
    if (message.role === "user") {
      lines.push(`## السؤال`, "", message.content, "");
    } else {
      lines.push(`## الجواب`, "", message.content, "");
      if (options.includeEvidence && message.response && message.response.ayahs.length > 0) {
        lines.push(`### الدليل القرآني`, "");
        message.response.ayahs.forEach((ayah, index) => {
          lines.push(`[${index + 1}] سورة ${ayah.surah} · ${ayah.ayah}`, `> ${ayah.text.trim()}`, "");
        });
      }
    }
  }

  lines.push("---", "بصائر القرآن · Baṣāʾir");
  return lines.join("\n");
}
