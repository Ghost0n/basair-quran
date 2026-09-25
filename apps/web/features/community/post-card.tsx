"use client";

import type { PostSummary } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { relativeAge } from "@/features/companions/use-companions";
import { useNumerals } from "@/lib/preferences-context";

import { STATUS_LABEL } from "./labels";

export type PostCardActions = {
  onLike?: (post: PostSummary) => void;
  onSave?: (post: PostSummary) => void;
  onShare?: (post: PostSummary) => void;
  onComments?: (post: PostSummary) => void;
  onAuthor?: (post: PostSummary) => void;
  onTag?: (tag: string) => void;
};

/**
 * A post in a list. The title block opens the post; the author and tags filter
 * the feed; the footer reacts in place (like, save) or shares the link. Cards
 * without handlers (moderation queue, «منشوراتي») show plain counts.
 */
export function PostCard({
  post,
  surahName,
  onOpen,
  showStatus = false,
  index = 0,
  actions = {},
}: {
  post: PostSummary;
  surahName: (surahId: number) => string;
  onOpen: (postId: string) => void;
  showStatus?: boolean;
  index?: number;
  actions?: PostCardActions;
}) {
  const formatNumber = useNumerals();
  const when = post.published_at ?? post.updated_at;
  const interactive = post.status === "published" && Boolean(actions.onLike);
  return (
    <article className="qb-post-card qb-glass qb-rise" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <header className="top">
        <span className="avatar" aria-hidden>
          {post.author_name.trim().charAt(0) || "ب"}
        </span>
        <span className="who">
          {actions.onAuthor && post.author_id != null ? (
            <button type="button" className="author link" onClick={() => actions.onAuthor?.(post)} title="منشورات هذا الباحث">
              {post.author_name}
            </button>
          ) : (
            <span className="author">{post.author_name}</span>
          )}
          <span className="when">
            {relativeAge(when, formatNumber)} · قراءة {formatNumber(post.reading_minutes ?? 1)} د
          </span>
        </span>
        {post.mode === "tafssir" ? <span className="qb-chip tafssir">تفسيرية تجريبية</span> : null}
        {post.has_board ? (
          <span className="qb-chip">
            <Icon name="graph" size={11} /> لوحة
          </span>
        ) : null}
        {showStatus ? <span className={`qb-chip status s-${post.status}`}>{STATUS_LABEL[post.status]}</span> : null}
        {showStatus && post.visibility === "unlisted" ? <span className="qb-chip">برابط فقط</span> : null}
      </header>
      <button type="button" className="open" onClick={() => onOpen(post.id)} aria-label={`افتح «${post.title}»`}>
        <h3>{post.title}</h3>
        {post.summary ? <p className="summary">{post.summary}</p> : null}
        {post.excerpt ? (
          <blockquote>
            <p>{post.excerpt.text}</p>
            <cite>
              ﴿{surahName(post.excerpt.surah_id)}: {formatNumber(post.excerpt.ayah)}﴾
            </cite>
          </blockquote>
        ) : null}
      </button>
      {post.tags?.length ? (
        <div className="tags">
          {post.tags.map((tag) =>
            actions.onTag ? (
              <button key={tag} type="button" className="tag" onClick={() => actions.onTag?.(tag)}>
                #{tag}
              </button>
            ) : (
              <span key={tag} className="tag">
                #{tag}
              </span>
            ),
          )}
        </div>
      ) : null}
      <footer>
        {interactive ? (
          <>
            <button
              type="button"
              className={`act${post.liked_by_me ? " on like" : ""}`}
              aria-pressed={post.liked_by_me}
              aria-label={post.liked_by_me ? "إلغاء الإعجاب" : "أعجبني"}
              onClick={() => actions.onLike?.(post)}
            >
              <Icon name={post.liked_by_me ? "heartFilled" : "heart"} size={15} /> {formatNumber(post.like_count)}
            </button>
            <button type="button" className="act" aria-label="التعليقات" onClick={() => actions.onComments?.(post)}>
              <Icon name="comment" size={15} /> {formatNumber(post.comment_count)}
            </button>
            <span className="stat">
              <Icon name="book" size={14} /> {formatNumber(post.ayah_count)} آية
            </span>
            <span className="grow" />
            <button
              type="button"
              className={`act icon${post.saved_by_me ? " on save" : ""}`}
              aria-pressed={post.saved_by_me}
              aria-label={post.saved_by_me ? "إزالة من المحفوظة" : "احفظ"}
              title={post.saved_by_me ? "محفوظ" : "احفظ"}
              onClick={() => actions.onSave?.(post)}
            >
              <Icon name={post.saved_by_me ? "bookmarkFilled" : "bookmark"} size={15} />
            </button>
            <button type="button" className="act icon" aria-label="شارك الرابط" title="شارك الرابط" onClick={() => actions.onShare?.(post)}>
              <Icon name="share" size={15} />
            </button>
          </>
        ) : (
          <>
            <span className={`stat${post.liked_by_me ? " on" : ""}`}>
              <Icon name="heart" size={14} /> {formatNumber(post.like_count)}
            </span>
            <span className="stat">
              <Icon name="comment" size={14} /> {formatNumber(post.comment_count)}
            </span>
            <span className="stat">
              <Icon name="book" size={14} /> {formatNumber(post.ayah_count)} آية
            </span>
          </>
        )}
      </footer>
    </article>
  );
}
