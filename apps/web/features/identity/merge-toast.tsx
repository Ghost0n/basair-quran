"use client";

import { useEffect, useRef, useState } from "react";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { GuestMergeResult } from "@q-basair/shared";

import { AVATAR_MOTIFS, type AvatarMotif, UserAvatar } from "@/components/brand-mark";
import { API_BASE_URL, AUTH_ENABLED } from "@/lib/config";
import { readAndClearMergeResult } from "@/features/auth/identity-flow";
import { useNumerals } from "@/lib/preferences-context";

import "./merge-toast.css";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });
const MOTIFS = Object.keys(AVATAR_MOTIFS) as AvatarMotif[];
const COUNTDOWN = 30;

function toMotif(value?: string | null): AvatarMotif {
  return value && (MOTIFS as string[]).includes(value) ? (value as AvatarMotif) : "ba";
}

/**
 * MergeToast — the guest→account merge moment. After a guest signs up, their
 * local data is moved to the account; this toast confirms it with a 30s undo
 * (which restores the data to the guest, deleting nothing). Reads the result
 * the identity flow stashed on the way in.
 */
export function MergeToast() {
  const formatNumber = useNumerals();
  const [result, setResult] = useState<GuestMergeResult | null>(null);
  const [secs, setSecs] = useState(COUNTDOWN);
  const [undone, setUndone] = useState(false);
  const [motif, setMotif] = useState<AvatarMotif>("ba");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!AUTH_ENABLED) return;
    const stashed = readAndClearMergeResult();
    if (!stashed) return;
    setResult(stashed);
    api
      .getAuthSession({ suppressAuthRedirect: true })
      .then((session) => {
        if (session.user?.avatar) setMotif(toMotif(session.user.avatar));
      })
      .catch(() => {
        /* keep the default medallion */
      });
  }, []);

  useEffect(() => {
    if (!result || undone) return;
    timer.current = window.setInterval(() => {
      setSecs((value) => {
        if (value <= 1) {
          if (timer.current) window.clearInterval(timer.current);
          setResult(null);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [result, undone]);

  if (!result) return null;

  if (undone) {
    return (
      <div className="qb-merge-undone" role="status">
        أُلغي الضمّ — بقيت محفوظات الضيف محليّةً على هذا الجهاز
      </div>
    );
  }

  const summary = [
    result.notebook_moved ? `${formatNumber(result.notebook_moved)} آية مُثبَّتة` : null,
    result.sessions_moved ? `${formatNumber(result.sessions_moved)} جلسة بحث` : null,
    result.roots_moved ? `${formatNumber(result.roots_moved)} جذر مُتابَع` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function undo() {
    if (timer.current) window.clearInterval(timer.current);
    if (result?.undo_token) {
      try {
        await api.undoMergeGuestData({ undo_token: result.undo_token }, { suppressAuthRedirect: true });
      } catch {
        /* the client keeps its local copy either way */
      }
    }
    setUndone(true);
    window.setTimeout(() => {
      setUndone(false);
      setResult(null);
    }, 3200);
  }

  const ringPct = (secs / COUNTDOWN) * 100;

  return (
    <div className="qb-merge-toast" role="status">
      <UserAvatar motif={motif} size={38} />
      <div className="qb-merge-copy">
        <div className="title">ضممنا محفوظاتِ الضيف إلى حسابك</div>
        <div className="sub">{summary || "موضع القراءة"} — أصبحت تُزامَن</div>
      </div>
      <button type="button" className="qb-merge-undo" onClick={undo}>
        تراجَع
      </button>
      <span
        className="qb-merge-ring"
        style={{ background: `conic-gradient(var(--gold-400) ${ringPct}%, transparent 0)` }}
        aria-hidden
      >
        <span className="inner">{formatNumber(secs)}</span>
      </span>
    </div>
  );
}
