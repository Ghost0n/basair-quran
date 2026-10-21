"use client";

import "./community.css";
import "@/features/documents/documents.css";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { CommentItem, GuidelineRule, PostDetail, SurahListItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";
import { useNumerals } from "@/lib/preferences-context";
import { BoardView } from "@/features/board/board-view";
import { relativeAge } from "@/features/companions/use-companions";
import { DocumentView } from "@/features/documents/document-view";
import { ShareStudio } from "@/features/documents/share-studio";
import { postUrl } from "./share-link";
import { useMushaf } from "@/features/reading/mushaf-context";
import { useShellMode } from "@/features/shell/mode-context";
import { TafssirDisclaimer } from "@/features/studio/tafssir-disclaimer";

import { REPORT_RULES, RULE_LABEL, isBanned } from "./labels";
import { ReviewBanner } from "./review-banner";
import { useCommunityAccess } from "./use-community-access";

import { t } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

/** One shared research: the document (and its board), likes, sharing, comments. */
export function PostScreen() {
  const params = useSearchParams();
  const postId = params.get("id") ?? "";
  const { setMode } = useShellMode();
  const router = useRouter();
  const mushaf = useMushaf();
  const formatNumber = useNumerals();
  const access = useCommunityAccess();

  const [post, setPost] = useState<PostDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [view, setView] = useState<"document" | "board">("document");
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [reporting, setReporting] = useState<{ type: "post" | "comment"; id: string } | null>(null);
  const [surahs, setSurahs] = useState<SurahListItem[]>([]);

  useEffect(() => {
    api.getSurahs(2).then(setSurahs).catch(() => {});
  }, []);
  const surahName = (surahId: number) => surahs.find((surah) => surah.id === surahId)?.name ?? String(surahId);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api
      .getPost(postId)
      .then((loaded) => {
        if (cancelled) return;
        setPost(loaded);
        setStatus("ready");
        if (loaded.status === "published") api.getComments(postId).then((list) => !cancelled && setComments(list)).catch(() => {});
      })
      .catch(() => !cancelled && setStatus("missing"));
    return () => {
      cancelled = true;
    };
  }, [postId]);

  // «التعليقات» from a feed card lands on `#comments` once the post has rendered.
  useEffect(() => {
    if (status !== "ready" || window.location.hash !== "#comments") return;
    const timer = window.setTimeout(
      () => document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      120,
    );
    return () => window.clearTimeout(timer);
  }, [status]);

  function say(message: string) {
    setFlash(message);
    window.setTimeout(() => setFlash((current) => (current === message ? null : current)), 3200);
  }

  function requireAccount(): boolean {
    if (access.canWrite) return true;
    say(t("سجّل الدخول لتتفاعل مع المجتمع."));
    return false;
  }

  async function toggleLike() {
    if (!post || !requireAccount()) return;
    const next = !post.liked_by_me;
    setPost({ ...post, liked_by_me: next, like_count: post.like_count + (next ? 1 : -1) });
    try {
      const result = await api.setLike(post.id, next);
      setPost((current) => (current ? { ...current, liked_by_me: result.liked, like_count: result.like_count } : current));
    } catch {
      setPost((current) => (current ? { ...current, liked_by_me: !next, like_count: post.like_count } : current));
    }
  }

  async function sendComment() {
    const body = draft.trim();
    if (!post || !body || !requireAccount()) return;
    try {
      const created = await api.addComment(post.id, body);
      setComments((current) => [...current, created]);
      if (created.status === "visible") {
        setPost((current) => (current ? { ...current, comment_count: current.comment_count + 1 } : current));
      } else {
        say(t("سيظهر تعليقك للجميع بعد فحصه."));
      }
      setDraft("");
    } catch (err) {
      say(
        isBanned(err)
          ? t("النشر والتعليق موقوفان مؤقتاً لحسابك.")
          : err instanceof Error && /روابط/.test(err.message)
            ? t("التعليق يحوي روابط كثيرة.")
            : t("تعذّر إرسال التعليق."),
      );
    }
  }

  async function removeComment(comment: CommentItem) {
    await api.deleteComment(comment.id).catch(() => {});
    setComments((current) => current.filter((entry) => entry.id !== comment.id));
  }

  async function toggleSave() {
    if (!post || !requireAccount()) return;
    const next = !post.saved_by_me;
    setPost({ ...post, saved_by_me: next });
    try {
      await api.setSaved(post.id, next);
      say(next ? t("حُفظ في «المحفوظة».") : t("أُزيل من «المحفوظة»."));
    } catch {
      setPost((current) => (current ? { ...current, saved_by_me: !next } : current));
    }
  }

  async function copyLink() {
    try {
      const url = postUrl(postId);
      if (!url) throw new Error("no public address");
      await navigator.clipboard.writeText(url);
      say(t("نُسخ الرابط."));
    } catch {
      say(t("تعذّر النسخ."));
    }
  }

  async function sendReport(rule: GuidelineRule, note: string) {
    if (!reporting || !requireAccount()) return;
    try {
      await api.report({ target_type: reporting.type, target_id: reporting.id, rule, note: note || null });
      say(t("وصل البلاغ إلى المشرفين. شكراً لك."));
    } catch {
      say(t("تعذّر إرسال البلاغ."));
    }
    setReporting(null);
  }

  async function withdraw() {
    if (!post) return;
    await api.withdrawPost(post.id).catch(() => {});
    setMode("community");
  }

  function openAyah(surahId: number, ayah: number, ayahId?: number | null) {
    if (ayahId) void mushaf.loadByAyah(2, ayahId, []);
    else void mushaf.loadBySurah(2, surahId, ayah);
    setMode("reading");
  }

  if (status === "missing") {
    return (
      <div className="qb-doc-state">
        <p>{t("هذا المنشور غير متاح.")}</p>
        <button type="button" onClick={() => setMode("community")}>{t("إلى المجتمع")}</button>
      </div>
    );
  }
  if (!post) return <div className="qb-skeleton-page" aria-hidden />;

  return (
    <div className="qb-post qb-page-enter">
      <div className="qb-post-bar qb-glass-strong">
        <button type="button" className="qb-icon-round" onClick={() => setMode("community")} aria-label={t("إلى المجتمع")}>
          <Icon name="chevRight" size={18} />
        </button>
        <span className="crumb">{t("المجتمع")}</span>
        <div className="acts">
          {post.status === "published" ? (
            <>
              <button type="button" className={`qb-btn like${post.liked_by_me ? " on" : ""}`} onClick={() => void toggleLike()} aria-pressed={post.liked_by_me}>
                <Icon name={post.liked_by_me ? "heartFilled" : "heart"} size={15} /> {formatNumber(post.like_count)}
              </button>
              <button
                type="button"
                className={`qb-btn ghost${post.saved_by_me ? " saved" : ""}`}
                onClick={() => void toggleSave()}
                aria-pressed={post.saved_by_me}
                aria-label={post.saved_by_me ? t("إزالة من المحفوظة") : t("احفظ")}
              >
                <Icon name={post.saved_by_me ? "bookmarkFilled" : "bookmark"} size={15} />
              </button>
              <button type="button" className="qb-btn ghost" onClick={() => void copyLink()}>
                <Icon name="link" size={15} /> <span className="lbl">{t("الرابط")}</span>
              </button>
              <button type="button" className="qb-btn ghost" onClick={() => setSharing(true)}>
                <Icon name="share" size={15} /> <span className="lbl">{t("مشاركة")}</span>
              </button>
              {!post.is_mine ? (
                <button type="button" className="qb-btn ghost" onClick={() => setReporting({ type: "post", id: post.id })} aria-label={t("إبلاغ")}>
                  <Icon name="flag" size={15} />
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div className="qb-post-body">
        {flash ? <div className="qb-toast-inline" role="status">{flash}</div> : null}

        {post.is_mine ? (
          <ReviewBanner post={post} onEdit={() => router.push(`/?mode=document&id=${encodeURIComponent(post.document.id)}`)} />
        ) : null}

        <header className="qb-post-head">
          <div className="author">
            <span className="avatar" aria-hidden>{post.author_name.trim().charAt(0) || "ب"}</span>
            <span>
              <b>{post.author_name}</b>
              <small>{relativeAge(post.published_at ?? post.updated_at, formatNumber)}{post.visibility === "unlisted" ? t("، برابط فقط") : ""}</small>
            </span>
          </div>
          <h1>{post.title}</h1>
          {post.summary ? <p className="summary">{post.summary}</p> : null}
          {post.tags?.length ? (
            <div className="tags">
              {post.tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="tag"
                  onClick={() => router.push(`/?mode=community&tag=${encodeURIComponent(tag)}`)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          ) : null}
        </header>

        {post.mode === "tafssir" ? <TafssirDisclaimer /> : null}

        {post.board ? (
          <div className="qb-segmented qb-fit-track" data-autofit="1" suppressHydrationWarning role="tablist" aria-label={t("عرض المنشور")}>
            <button type="button" role="tab" aria-selected={view === "document"} className={view === "document" ? "on" : ""} onClick={() => setView("document")}>
              <Icon name="page" size={14} /> {t("البحث")}
            </button>
            <button type="button" role="tab" aria-selected={view === "board"} className={view === "board" ? "on" : ""} onClick={() => setView("board")}>
              <Icon name="graph" size={14} /> {t("اللوحة")}
            </button>
          </div>
        ) : null}

        {view === "board" && post.board ? (
          <div className="qb-post-board qb-glass">
            <BoardView snapshot={post.board} onOpenAyah={(item) => openAyah(item.surah_id ?? 1, item.ayah ?? 1, item.ayah_id)} />
          </div>
        ) : (
          <DocumentView
            sections={post.document.sections}
            references={post.document.references}
            surahName={surahName}
            onOpenAyah={openAyah}
          />
        )}

        {post.is_mine ? (
          <div className="qb-post-owner">
            <button type="button" className="qb-btn ghost danger-text" onClick={() => void withdraw()}>
              <Icon name="trash" size={14} /> {t("سحب المنشور")}
            </button>
          </div>
        ) : null}

        {post.status === "published" ? (
          <section className="qb-comments" id="comments">
            <h2>
              {t("التعليقات")} <span className="count">{formatNumber(comments.length)}</span>
            </h2>
            {comments.map((comment, index) =>
              comment.status === "hidden" && !comment.body ? (
                // Hidden by a moderator, the checks or reports: no author, no text.
                <div key={comment.id} className="qb-comment hidden">
                  <span className="avatar" aria-hidden>
                    <Icon name="eyeOff" size={13} />
                  </span>
                  <div className="bubble">
                    <p>{t("تعليق مخفي")}</p>
                  </div>
                </div>
              ) : (
              <div
                key={comment.id}
                className={`qb-comment qb-rise${comment.status !== "visible" ? ` ${comment.status}` : ""}`}
                style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
              >
                <span className="avatar" aria-hidden>{comment.author_name.trim().charAt(0) || "ب"}</span>
                <div className="bubble">
                  <div className="meta">
                    <b>{comment.author_name}</b> <small>{relativeAge(comment.created_at, formatNumber)}</small>
                    {comment.status === "pending" ? <span className="state">{t("قيد الفحص")}</span> : null}
                    {comment.status === "hidden" ? <span className="state">{t("مخفي عن القرّاء")}</span> : null}
                  </div>
                  <p>{comment.body}</p>
                </div>
                {comment.is_mine ? (
                  <button type="button" className="qb-icon-round small" onClick={() => void removeComment(comment)} aria-label={t("حذف التعليق")}>
                    <Icon name="trash" size={13} />
                  </button>
                ) : (
                  <button type="button" className="qb-icon-round small" onClick={() => setReporting({ type: "comment", id: String(comment.id) })} aria-label={t("إبلاغ عن التعليق")}>
                    <Icon name="flag" size={13} />
                  </button>
                )}
              </div>
              ),
            )}
            {access.canWrite ? (
              <form
                className="qb-comment-composer qb-glass"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendComment();
                }}
              >
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
                  placeholder={t("أضف تعليقاً يثري البحث… (ناقش الفكرة لا الشخص)")}
                  aria-label={t("تعليق")}
                  rows={2}
                />
                <button type="submit" className="qb-btn primary" disabled={!draft.trim()}>
                  <Icon name="send" size={14} /> {t("تعليق")}
                </button>
              </form>
            ) : (
              <a className="qb-btn ghost" href="/login">{t("سجّل الدخول لتعلّق")}</a>
            )}
          </section>
        ) : null}
      </div>

      {reporting ? <ReportSheet onClose={() => setReporting(null)} onSend={sendReport} /> : null}
      {sharing ? (
        <ShareStudio
          research={{
            title: post.title,
            summary: post.summary,
            mode: post.mode ?? null,
            sections: post.document.sections,
            aiSectionIds: post.document.provenance?.ai_sections ?? [],
            author: post.author_name,
            url: post.status === "published" ? postUrl(post.id) : null,
          }}
          references={post.document.references}
          surahName={surahName}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </div>
  );
}

function ReportSheet({ onClose, onSend }: { onClose: () => void; onSend: (rule: GuidelineRule, note: string) => void }) {
  const [rule, setRule] = useState<GuidelineRule>("other");
  const [note, setNote] = useState("");
  return (
    <div className="qb-rsheet" role="dialog" aria-modal="true" aria-label={t("إبلاغ")}>
      <div className="backdrop" onClick={onClose} aria-hidden />
      <div className="panel" tabIndex={-1}>
        <div className="grip" aria-hidden />
        <div className="head">
          <h2>{t("إبلاغ المشرفين")}</h2>
          <button type="button" className="close" onClick={onClose} aria-label={t("إغلاق")}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="body qb-report">
          <div className="label">{t("ما البند المخالَف؟")}</div>
          <div className="rules" role="radiogroup">
            {REPORT_RULES.map((entry) => (
              <button key={entry} type="button" role="radio" aria-checked={rule === entry} className={rule === entry ? "on" : ""} onClick={() => setRule(entry)}>
                {RULE_LABEL[entry]}
              </button>
            ))}
          </div>
          <textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 500))} placeholder={t("تفصيل اختياري…")} rows={3} aria-label={t("تفصيل البلاغ")} />
          <button type="button" className="qb-btn primary block" onClick={() => onSend(rule, note.trim())}>
            {t("إرسال البلاغ")}
          </button>
        </div>
      </div>
    </div>
  );
}
