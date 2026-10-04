"use client";

import { useEffect, useRef, useState } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { AyahReaderResponse } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";

import { NODE_W } from "./board-model";
import { readShape, readStyle, styleVars } from "./board-style";
import { useBoard } from "./board-context";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/** Handles on all four sides; the board connects in loose mode (any ↔ any). */
function Handles() {
  return (
    <>
      <Handle type="source" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="source" position={Position.Left} id="l" />
    </>
  );
}

/** An ayah of the theme. Expanding it turns it into a scrollable mini reader of its passage. */
export function AyahNode({ id, data, selected }: NodeProps) {
  const board = useBoard();
  const formatNumber = useNumerals();
  const item = board.itemFor(id);
  const expanded = Boolean(data.expanded);

  return (
    <div
      className={`qb-bnode ayah${selected ? " sel" : ""}${expanded ? " open" : ""}`}
      data-hl={board.themeColor}
      // Same width expanded: the mini reader grows downward, never into a neighbour.
      style={{ width: NODE_W, ...styleVars(readStyle(data)) }}
      dir="rtl"
    >
      <Handles />
      <header>
        <span className="ref">
          {item?.surah ?? t("آية")} {item?.ayah != null ? formatNumber(item.ayah) : ""}
        </span>
        <span className="acts nodrag">
          <button
            type="button"
            onClick={() => board.updateData(id, { expanded: !expanded })}
            aria-label={expanded ? t("طيّ السياق") : t("عرض السياق")}
            title={expanded ? t("طيّ السياق") : t("اقرأ الآية في سياقها")}
          >
            <Icon name={expanded ? "shrink" : "expand"} size={13} />
          </button>
          {item ? (
            <button type="button" onClick={() => board.openInReader(item)} aria-label={t("افتح في المصحف")} title={t("افتح في المصحف")}>
              <Icon name="book" size={13} />
            </button>
          ) : null}
        </span>
      </header>
      {expanded && item ? (
        <MiniReader ayahId={item.ayah_id} mushafId={item.mushaf_id || 2} />
      ) : (
        <p className="text">{item?.text ?? "…"}</p>
      )}
    </div>
  );
}

/** The ayah's passage (±5 ayahs of its surah), scrolled to the ayah; wheel/drag stay inside. */
function MiniReader({ ayahId, mushafId }: { ayahId: number; mushafId: number }) {
  const formatNumber = useNumerals();
  const [data, setData] = useState<AyahReaderResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAyahReader(ayahId, { mushaf: mushafId, before: 5, after: 5 })
      .then((response) => !cancelled && setData(response))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [ayahId, mushafId]);

  useEffect(() => {
    const box = scrollRef.current;
    const center = box?.querySelector<HTMLElement>(".center");
    if (box && center) box.scrollTop = center.offsetTop - box.clientHeight / 2 + center.clientHeight / 2;
  }, [data]);

  return (
    <div className="mini nowheel nodrag" ref={scrollRef}>
      {failed ? <p className="state">{t("تعذّر تحميل السياق.")}</p> : null}
      {!data && !failed ? <p className="state">{t("جارٍ التحميل…")}</p> : null}
      {data?.ayahs.map((ayah) => (
        <p key={ayah.ayah_id} className={ayah.is_center ? "center" : ""}>
          {ayah.text} <span className="n">﴿{formatNumber(ayah.ayah)}﴾</span>
        </p>
      ))}
    </div>
  );
}

function useAutoFocus(data: Record<string, unknown>, id: string) {
  const board = useBoard();
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  useEffect(() => {
    if (!data.autoFocus) return;
    // React Flow keeps a new node hidden until measured; focus once it shows.
    const timer = window.setTimeout(() => ref.current?.focus(), 60);
    board.updateData(id, { autoFocus: undefined });
    return () => window.clearTimeout(timer);
    // Only when the node is created with autoFocus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

/** A free-text note (the researcher's reflection). */
export function NoteNode({ id, data, selected }: NodeProps) {
  const board = useBoard();
  const ref = useAutoFocus(data, id);
  return (
    <div className={`qb-bnode note${selected ? " sel" : ""}`} dir="auto" style={styleVars(readStyle(data))}>
      <NodeResizer isVisible={selected && !board.readOnly} minWidth={180} minHeight={80} lineClassName="qb-resize-line" handleClassName="qb-resize-handle" />
      <Handles />
      {board.readOnly ? (
        <p className="note-text">{String(data.text ?? "")}</p>
      ) : (
      <textarea
        ref={ref}
        className="nodrag nowheel"
        value={String(data.text ?? "")}
        placeholder={t("ملاحظة…")}
        maxLength={2000}
        aria-label={t("ملاحظة")}
        onChange={(event) => board.updateData(id, { text: event.target.value })}
      />
      )}
    </div>
  );
}

/** A drawn shape (rectangle · ellipse · diamond) with optional text inside. */
export function ShapeNode({ id, data, selected }: NodeProps) {
  const board = useBoard();
  const ref = useAutoFocus(data, id);
  const shape = readShape(data);
  return (
    <div className={`qb-bnode shape ${shape}${selected ? " sel" : ""}`} dir="auto" style={styleVars(readStyle(data))}>
      <NodeResizer isVisible={selected && !board.readOnly} minWidth={60} minHeight={40} lineClassName="qb-resize-line" handleClassName="qb-resize-handle" />
      <Handles />
      <svg className="outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {shape === "ellipse" ? (
          <ellipse cx="50" cy="50" rx="49" ry="49" vectorEffect="non-scaling-stroke" />
        ) : shape === "diamond" ? (
          <polygon points="50,1 99,50 50,99 1,50" vectorEffect="non-scaling-stroke" />
        ) : (
          <rect x="1" y="1" width="98" height="98" rx="6" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {board.readOnly ? (
        <p className="shape-text">{String(data.text ?? "")}</p>
      ) : (
        <textarea
          ref={ref}
          className="nodrag nowheel shape-text"
          value={String(data.text ?? "")}
          placeholder={t("نص…")}
          maxLength={400}
          aria-label={t("نص الشكل")}
          onChange={(event) => board.updateData(id, { text: event.target.value })}
        />
      )}
    </div>
  );
}

/** A heading that names a region of the board. */
export function HeadingNode({ id, data, selected }: NodeProps) {
  const board = useBoard();
  const ref = useAutoFocus(data, id);
  return (
    <div className={`qb-bnode heading${selected ? " sel" : ""}`} dir="auto" style={styleVars(readStyle(data))}>
      <Handles />
      {board.readOnly ? (
        <h4 className="heading-text">{String(data.text ?? "")}</h4>
      ) : (
      <input
        ref={ref}
        className="nodrag"
        value={String(data.text ?? "")}
        placeholder={t("عنوان…")}
        maxLength={80}
        aria-label={t("عنوان")}
        onChange={(event) => board.updateData(id, { text: event.target.value })}
      />
      )}
    </div>
  );
}
