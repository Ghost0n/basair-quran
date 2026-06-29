"use client";

import "./companions.css";

import { useRouter } from "next/navigation";

import { Icon } from "@/components/icon";
import { useNumerals } from "@/lib/preferences-context";

import { relativeAge, useCompanions } from "./use-companions";

/**
 * Followed roots — the roots the user is tracking across the Qurʾān.
 */
export function RootsScreen() {
  const companions = useCompanions();
  const formatNumber = useNumerals();
  const router = useRouter();

  return (
    <div className="qb-aux">
      <div className="qb-aux-h">
        <div>
          <div className="kicker">الجذور · ROOTS</div>
          <h2>جذور مُتابَعة</h2>
          <div className="sub">{formatNumber(companions.roots.length)} جذر</div>
        </div>
      </div>

      {companions.loading ? (
        <div className="qb-aux-state">جارٍ التحميل…</div>
      ) : companions.roots.length === 0 ? (
        <div className="qb-aux-state">لا توجد جذور مُتابَعة بعد. تابِع جذراً من لوحة المطابقة.</div>
      ) : (
        <div className="qb-aux-list">
          {companions.roots.map((root) => (
            <div key={root.id} className="qb-aux-row">
              <span className="icon-tile">
                <Icon name="tree" size={18} />
              </span>
              <div className="grow">
                <div className="root-disp">{root.root_text}</div>
                <div className="meta">
                  {root.occurrences != null ? `${formatNumber(root.occurrences)} موضع · ` : ""}
                  {relativeAge(root.created_at)}
                </div>
              </div>
              <button
                type="button"
                className="row-action"
                aria-label="خريطة انتشار الجذر"
                title="خريطة الانتشار"
                onClick={() => router.push(`/?mode=heatmap&root=${encodeURIComponent(root.root_text)}`)}
              >
                <Icon name="graph" size={15} />
              </button>
              <button
                type="button"
                className="row-action"
                aria-label="إلغاء المتابعة"
                onClick={() => void companions.unfollowRoot(root.id)}
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
