"use client";

import "./companions.css";

import { useState } from "react";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";

import { relativeAge, useCompanions } from "./use-companions";

type SessionFilter = "all" | "strict" | "tafssir";

const FILTERS: { value: SessionFilter; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "strict", label: "القرآن وحدَه" },
  { value: "tafssir", label: "تفسيرية" },
];

/**
 * Research session history — every saved Studio session, filterable by
 * strict vs tafssir mode.
 */
export function SessionsScreen() {
  const companions = useCompanions();
  const [filter, setFilter] = useState<SessionFilter>("all");
  const formatNumber = useNumerals();

  const visible = companions.sessions.filter(
    (session) => filter === "all" || session.mode === filter,
  );

  return (
    <div className="qb-aux">
      <div className="qb-aux-h">
        <div>
          <div className="kicker">السجلّ · HISTORY</div>
          <h2>جلسات البحث</h2>
          <div className="sub">{formatNumber(companions.sessions.length)} جلسة محفوظة</div>
        </div>
      </div>

      <div className="qb-form-tabs" style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`qb-pill${filter === option.value ? " active" : ""}`}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {companions.loading ? (
        <div className="qb-aux-state">جارٍ التحميل…</div>
      ) : visible.length === 0 ? (
        <div className="qb-aux-state">لا توجد جلسات محفوظة في هذا التصنيف.</div>
      ) : (
        <div className="qb-aux-list">
          {visible.map((session) => (
            <div key={session.id} className="qb-aux-row">
              <span className={`icon-tile${session.mode === "tafssir" ? " copper" : ""}`}>
                <Icon name={session.mode === "tafssir" ? "feather" : "scale"} size={18} />
              </span>
              <div className="grow">
                <div className="title">{session.title}</div>
                <div className="meta">
                  {formatNumber(session.message_count)} رسالة · {relativeAge(session.updated_at)} ·{" "}
                  {session.mode === "tafssir" ? "قراءة تفسيرية" : "القرآن وحدَه"}
                </div>
              </div>
              <button
                type="button"
                className="row-action"
                aria-label="حذف الجلسة"
                onClick={() => void companions.deleteSession(session.id)}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
