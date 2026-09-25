"use client";

import type { PostSummary } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { relativeAge } from "@/features/companions/use-companions";
import { useNumerals } from "@/lib/preferences-context";

import { STATUS_LABEL } from "./labels";

/** A post in a list: title, author, excerpt ayah, counts — the whole card opens it. */
export function PostCard({
  post,
  surahName,
  onOpen,
  showStatus = false,
  index = 0,
}: {
  post: PostSummary;
  surahName: (surahId: number) => string;
  onOpen: (postId: string) => void;
  showStatus?: boolean;
  index?: number;
}) {
  const formatNumber = useNumerals();
  const when = post.published_at ?? post.updated_at;
  return (
    <article className="qb-post-card qb-glass qb-rise" style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}>
      <button type="button" className="open" onClick={() => onOpen(post.id)} aria-label={`افتح «${post.title}»`}>
        <div className="top">
          <span className="avatar" aria-hidden>
            {post.author_name.trim().charAt(0) || "ب"}
          </span>
          <span className="who">
            <span className="author">{post.author_name}</span>
            <span className="when">{relativeAge(when)}</span>
          </span>
          {post.mode === "tafssir" ? <span className="chip tafssir">تفسيرية تجريبية</span> : null}
          {post.has_board ? (
            <span className="chip">
              <Icon name="graph" size={11} /> لوحة
            </span>
          ) : null}
          {showStatus ? <span className={`chip status s-${post.status}`}>{STATUS_LABEL[post.status]}</span> : null}
          {showStatus && post.visibility === "unlisted" ? <span className="chip">برابط فقط</span> : null}
        </div>
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
      <footer>
        <span className={`stat${post.liked_by_me ? " on" : ""}`}>
          <Icon name="heart" size={14} /> {formatNumber(post.like_count)}
        </span>
        <span className="stat">
          <Icon name="comment" size={14} /> {formatNumber(post.comment_count)}
        </span>
        <span className="stat">
          <Icon name="book" size={14} /> {formatNumber(post.ayah_count)} آية
        </span>
      </footer>
    </article>
  );
}
