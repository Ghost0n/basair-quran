"use client";

import "./community.css";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { PostSummary, SurahListItem } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { API_BASE_URL } from "@/lib/config";

import { ModerationPanel } from "./moderation-panel";
import { PostCard } from "./post-card";
import { useCommunityAccess } from "./use-community-access";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

type Tab = "feed" | "mine" | "moderation";

/**
 * المجتمع — researches shared by the community. The feed lists published
 * public posts; «منشوراتي» shows the author's posts in every state (with the
 * review outcome); moderators get the review queue.
 */
export function CommunityScreen() {
  const router = useRouter();
  const access = useCommunityAccess();
  const [tab, setTab] = useState<Tab>("feed");
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [mine, setMine] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [surahs, setSurahs] = useState<SurahListItem[]>([]);

  useEffect(() => {
    api.getSurahs(2).then(setSurahs).catch(() => {});
  }, []);
  const surahName = (surahId: number) => surahs.find((surah) => surah.id === surahId)?.name ?? String(surahId);

  const loadFeed = useCallback(async (after: string | null) => {
    setLoading(true);
    setError(false);
    try {
      const page = await api.getFeed(after);
      setPosts((current) => (after ? [...current, ...page.posts] : page.posts));
      setCursor(page.next_cursor ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "feed") void loadFeed(null);
    if (tab === "mine" && access.canWrite) {
      setLoading(true);
      api
        .getMyPosts()
        .then(setMine)
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }
  }, [tab, access.canWrite, loadFeed]);

  const open = (postId: string) => router.push(`/?mode=post&id=${encodeURIComponent(postId)}`);

  const tabs: { value: Tab; label: string; icon: "users" | "user" | "gavel" }[] = [
    { value: "feed", label: "الأحدث", icon: "users" },
    ...(access.canWrite ? [{ value: "mine" as Tab, label: "منشوراتي", icon: "user" as const }] : []),
    ...(access.isModerator ? [{ value: "moderation" as Tab, label: "الإشراف", icon: "gavel" as const }] : []),
  ];

  return (
    <div className="qb-community qb-page-enter">
      <header className="qb-community-hero">
        <div>
          <div className="kicker">المجتمع</div>
          <h1>أبحاث يتشاركها المتدبّرون</h1>
          <p>
            كل بحث هنا مرّ بفحص نصوص الآيات ومراجعة وفق <a href="#guidelines">إرشادات المجتمع</a>. القرآن هو الدليل،
            وما سواه فهمٌ يُناقش.
          </p>
        </div>
        <button type="button" className="qb-btn primary" onClick={() => router.push("/?mode=notebook&tab=documents")}>
          <Icon name="plus" size={15} /> شارك بحثاً
        </button>
      </header>

      <div className="qb-segmented" role="tablist" aria-label="المجتمع">
        {tabs.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            className={tab === entry.value ? "on" : ""}
            onClick={() => setTab(entry.value)}
          >
            <Icon name={entry.icon} size={14} /> {entry.label}
          </button>
        ))}
      </div>

      {tab === "moderation" ? (
        <ModerationPanel surahName={surahName} onOpen={open} />
      ) : (
        <div className="qb-feed">
          {error ? <div className="qb-empty">تعذّر تحميل المنشورات.</div> : null}
          {tab === "feed" ? (
            <>
              {posts.map((post, index) => (
                <PostCard key={post.id} post={post} surahName={surahName} onOpen={open} index={index} />
              ))}
              {!loading && !error && posts.length === 0 ? (
                <div className="qb-empty">
                  <Icon name="users" size={28} />
                  <p>لم يُنشر بحث بعد. كن أول من يشارك تدبّره.</p>
                </div>
              ) : null}
              {cursor ? (
                <button type="button" className="qb-btn ghost more" onClick={() => void loadFeed(cursor)} disabled={loading}>
                  المزيد
                </button>
              ) : null}
            </>
          ) : (
            <>
              {mine.map((post, index) => (
                <PostCard key={post.id} post={post} surahName={surahName} onOpen={open} showStatus index={index} />
              ))}
              {!loading && mine.length === 0 ? (
                <div className="qb-empty">
                  <p>لم تنشر بحثاً بعد. افتح بحثاً من الدفتر واضغط «نشر».</p>
                </div>
              ) : null}
            </>
          )}
          {loading ? <div className="qb-skeleton-list" aria-hidden><span /><span /><span /></div> : null}
        </div>
      )}

      <section id="guidelines" className="qb-guidelines qb-glass">
        <h2>إرشادات المجتمع باختصار</h2>
        <ul>
          <li><b>القرآن هو الدليل:</b> انقل الآيات بنصّها ومرجعها، ولا تجتزئها من سياقها.</li>
          <li><b>تدبّر لا فتوى:</b> لا أحكام شرعية بصيغة الإلزام دون مرجع معتبر.</li>
          <li><b>المحتوى الآلي موسوم:</b> والقراءة التفسيرية تبقى تجريبية بتنبيهها.</li>
          <li><b>الأدب والإنصاف:</b> ناقش الفكرة لا الشخص، ولا طعن طائفياً.</li>
          <li><b>الأمانة العلمية:</b> انسب الأقوال لأصحابها واذكر درجة الحديث ومصدره.</li>
        </ul>
        <p className="fine">
          تمرّ المنشورات بفحوص آلية ثم بمراجعة وكيل آلي استشاري، والقرار الأخير للمشرفين.
        </p>
      </section>
    </div>
  );
}
