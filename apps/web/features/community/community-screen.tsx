"use client";

import "./community.css";
import "./community.web.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { goTo } from "@/features/shell/navigation";

import { createQBasairApiClient } from "@q-basair/api-client";
import type { PostSummary, SurahListItem, TagCount } from "@q-basair/shared";

import { Icon } from "@/components/icon";
import { GirihPattern } from "@/components/girih";
import { Ribbon, SURAH_NAMES } from "@/components/ribbon";
import { citedSurahCounts } from "@/features/studio/cited-surahs";
import { useWebDesign } from "@/lib/use-web-design";
import { useTopBarSlots } from "@/features/shell/top-bar-slots";
import { useNumerals } from "@/lib/preferences-context";
import { SelectMenu } from "@/components/select-menu";
import { API_BASE_URL } from "@/lib/config";

import { EMPTY_FILTERS, activeFilterCount, feedQuery, type FeedFilters } from "./feed-filters";
import { ModerationPanel } from "./moderation-panel";
import { PostCard, type PostCardActions } from "./post-card";
import { sharePostLink } from "./share-link";
import { useCommunityAccess } from "./use-community-access";

import { TAFSSIR_ENABLED } from "@/lib/features";
import { t, tn } from "@/lib/i18n";

const api = createQBasairApiClient({ baseUrl: API_BASE_URL });

type Tab = "feed" | "saved" | "mine" | "moderation";

function tabFrom(value: string | null): Tab {
  return value === "saved" || value === "mine" || value === "moderation" ? value : "feed";
}

/**
 * المجتمع — researches shared by the community. «الموجز» lists published
 * public posts (latest or trending, with search and filters); «المحفوظة» the
 * viewer's private bookmarks; «منشوراتي» the author's posts in every state
 * (with the review outcome); moderators get the review queue. Deep links:
 * `?mode=community&tag=…` and `&surah=…` (`q` belongs to the search mode).
 */
export function CommunityScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const access = useCommunityAccess();
  // The tab follows the address (the community world's tabs: الموجز · منشوراتي · المحفوظة).
  const urlTab = params.get("tab");
  // Home counts the posts published since this visit.
  useEffect(() => {
    try {
      window.localStorage.setItem("qb.community.seen", String(Math.floor(Date.now() / 1000)));
    } catch {
      /* not remembered */
    }
  }, []);
  const [tab, setTabState] = useState<Tab>(() => tabFrom(urlTab));
  useEffect(() => {
    setTabState(tabFrom(urlTab));
  }, [urlTab]);
  const setTab = useCallback(
    (next: Tab) => {
      setTabState(next);
      const sp = new URLSearchParams(window.location.search);
      if (next === "feed") sp.delete("tab");
      else sp.set("tab", next);
      goTo(router, `/?${sp.toString()}`, true);
    },
    [router],
  );
  const [filters, setFilters] = useState<FeedFilters>(() => ({
    ...EMPTY_FILTERS,
    tag: params.get("tag"),
    surah: Number(params.get("surah")) || null,
  }));
  const [debouncedQ, setDebouncedQ] = useState(filters.q);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  // Web design: which surahs the shown posts discuss (a ribbon that filters the feed).
  const web = useWebDesign();
  const topSlots = useTopBarSlots();
  const formatNumber = useNumerals();
  const [cursor, setCursor] = useState<string | null>(null);
  const [mine, setMine] = useState<PostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [surahs, setSurahs] = useState<SurahListItem[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const requestId = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.getSurahs(2).then(setSurahs).catch(() => {});
    api.getCommunityTags(14).then(setTags).catch(() => {});
  }, []);
  const surahName = useCallback(
    (surahId: number) => surahs.find((surah) => surah.id === surahId)?.name ?? String(surahId),
    [surahs],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(filters.q), 320);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const listTab = tab === "feed" || tab === "saved";

  const loadFeed = useCallback(
    async (after: string | null) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(false);
      try {
        const page = await api.getFeed(feedQuery(filters, debouncedQ, tab === "saved", after));
        if (id !== requestId.current) return; // a newer query superseded this one
        setPosts((current) => (after ? [...current, ...page.posts] : page.posts));
        setCursor(page.next_cursor ?? null);
      } catch {
        if (id === requestId.current) setError(true);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    // `filters.q` is read through `debouncedQ`, so typing doesn't refetch per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.sort, filters.surah, filters.tag, filters.mode, filters.board, filters.author, debouncedQ, tab],
  );

  useEffect(() => {
    if (listTab) {
      if (tab === "saved" && !access.canWrite) {
        setPosts([]);
        setLoading(false);
        return;
      }
      void loadFeed(null);
    }
    if (tab === "mine" && access.canWrite) {
      setLoading(true);
      api
        .getMyPosts()
        .then(setMine)
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }
  }, [tab, listTab, access.canWrite, loadFeed]);

  // Infinite scroll: load the next page when the sentinel nears the viewport.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor || !listTab) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !loading) void loadFeed(cursor);
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loading, listTab, loadFeed]);

  const open = (postId: string) => router.push(`/?mode=post&id=${encodeURIComponent(postId)}`);

  function say(message: string) {
    setFlash(message);
    window.setTimeout(() => setFlash((current) => (current === message ? null : current)), 3200);
  }

  function patchPost(postId: string, patch: Partial<PostSummary>) {
    setPosts((current) => current.map((post) => (post.id === postId ? { ...post, ...patch } : post)));
  }

  function requireAccount(): boolean {
    if (access.canWrite) return true;
    say(t("سجّل الدخول لتتفاعل مع المجتمع."));
    return false;
  }

  function setFilter<K extends keyof FeedFilters>(key: K, value: FeedFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const actions: PostCardActions = {
    async onLike(post) {
      if (!requireAccount()) return;
      const next = !post.liked_by_me;
      patchPost(post.id, { liked_by_me: next, like_count: post.like_count + (next ? 1 : -1) });
      try {
        const result = await api.setLike(post.id, next);
        patchPost(post.id, { liked_by_me: result.liked, like_count: result.like_count });
      } catch {
        patchPost(post.id, { liked_by_me: post.liked_by_me, like_count: post.like_count });
      }
    },
    async onSave(post) {
      if (!requireAccount()) return;
      const next = !post.saved_by_me;
      patchPost(post.id, { saved_by_me: next });
      try {
        await api.setSaved(post.id, next);
        say(next ? t("حُفظ في «المحفوظة».") : t("أُزيل من «المحفوظة»."));
        if (!next && tab === "saved") setPosts((current) => current.filter((entry) => entry.id !== post.id));
      } catch {
        patchPost(post.id, { saved_by_me: post.saved_by_me });
      }
    },
    async onShare(post) {
      const result = await sharePostLink(post);
      if (result === "copied") say(t("نُسخ رابط المنشور."));
      else if (result === "failed") say(t("تعذّرت المشاركة."));
    },
    onComments(post) {
      router.push(`/?mode=post&id=${encodeURIComponent(post.id)}#comments`);
    },
    onAuthor(post) {
      if (post.author_id == null) return;
      setTab("feed");
      setFilter("author", { id: post.author_id, name: post.author_name });
    },
    onTag(tag) {
      setTab("feed");
      setFilter("tag", tag);
    },
  };

  const tabs: { value: Tab; label: string; icon: "users" | "user" | "gavel" | "bookmark" }[] = [
    { value: "feed", label: t("الموجز"), icon: "users" },
    ...(access.canWrite ? [{ value: "saved" as Tab, label: t("المحفوظة"), icon: "bookmark" as const }] : []),
    ...(access.canWrite ? [{ value: "mine" as Tab, label: t("منشوراتي"), icon: "user" as const }] : []),
    ...(access.isModerator ? [{ value: "moderation" as Tab, label: t("الإشراف"), icon: "gavel" as const }] : []),
  ];

  const postSurahCounts = useMemo(() => citedSurahCounts(posts.flatMap((post) => (post.surah_ids ?? []).map((surah_id) => ({ surah_id })))), [posts]);
  const surahOptions = useMemo(
    () => [{ value: "", label: t("كل السور") }, ...surahs.map((surah) => ({ value: String(surah.id), label: `${surah.id}. ${surah.name}` }))],
    [surahs],
  );
  const filterCount = activeFilterCount(filters);
  const narrowed = filterCount > 0;

  // Web design, desktop: the tabs and «شارك بحثاً» go up into the top bar.
  const shareButton = (
    <button type="button" className="qb-btn primary" onClick={() => router.push("/?mode=notebook&tab=documents")}>
      <Icon name="plus" size={15} /> {t("شارك بحثاً")}
    </button>
  );
  const tabStrip = (
    <div className="qb-segmented qb-fit-track qb-community-tabs" data-autofit="1" suppressHydrationWarning role="tablist" aria-label={t("المجتمع")}>
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
  );

  const hero = (
    <>
      <header className="qb-community-hero">
        <div>
          <div className="kicker">{t("المجتمع")}</div>
          <h1>{t("أبحاث يتشاركها المتدبّرون")}</h1>
          <p>
            {t("كل بحث هنا مرّ بفحص نصوص الآيات ومراجعة وفق")} <a href="#guidelines">{t("إرشادات المجتمع")}</a>{t(". القرآن هو الدليل، وما سواه فهمٌ يُناقش.")}
          </p>
        </div>
        {topSlots ? null : shareButton}
      </header>

    </>
  );
  const ribbon = (
    <>
      {web && tab === "feed" && posts.length ? (
        <Ribbon
          className="qb-community-ribbon"
          counts={postSurahCounts}
          label={t("السور التي تتناولها الأبحاث المعروضة")}
          focus={filters.surah ? filters.surah - 1 : null}
          height={56}
          readout={(i) => t("{0}: {1}", { 0: SURAH_NAMES[i], 1: tn("{0} بحث", postSurahCounts[i], { 0: formatNumber(postSurahCounts[i]) }) })}
          restReadout={t("المس سورة لتعرض أبحاثها")}
          onPick={(i) => setFilter("surah", i == null || (filters.surah === i + 1) ? null : i + 1)}
        />
      ) : null}

    </>
  );
  const body = (
    <>
      {topSlots ? null : tabStrip}

      {listTab ? (
        <section className="qb-feed-tools qb-glass" aria-label={t("تصفية المنشورات")}>
          <div className="row">
            <label className="search">
              <Icon name="search" size={15} />
              <input
                type="search"
                value={filters.q}
                placeholder={t("ابحث في العناوين والملخّصات والوسوم…")}
                aria-label={t("ابحث في المنشورات")}
                onChange={(event) => setFilter("q", event.target.value)}
              />
            </label>
            <div className="qb-segmented qb-fit-track sort" data-autofit="1" suppressHydrationWarning role="radiogroup" aria-label={t("الترتيب")}>
              {(
                [
                  ["latest", t("الأحدث")],
                  ["top", t("الأبرز")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={filters.sort === value}
                  className={filters.sort === value ? "on" : ""}
                  onClick={() => setFilter("sort", value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`qb-btn ghost filters-toggle${showFilters || narrowed ? " lit" : ""}`}
              aria-expanded={showFilters}
              onClick={() => setShowFilters((value) => !value)}
            >
              <Icon name="filter" size={15} /> {t("تصفية")}{filterCount ? <span className="n">{filterCount}</span> : null}
            </button>
          </div>

          {showFilters ? (
            <div className="more-filters">
              <SelectMenu
                ariaLabel={t("السورة")}
                value={filters.surah ? String(filters.surah) : ""}
                options={surahOptions}
                onChange={(value) => setFilter("surah", value ? Number(value) : null)}
              />
              {/* The reading kind: only in a build with the explanatory reading (lib/features.ts). */}
              {TAFSSIR_ENABLED ? (
                <div className="qb-segmented qb-fit-track" data-autofit="1" suppressHydrationWarning role="radiogroup" aria-label={t("نوع البحث")}>
                  {(
                    [
                      [null, t("الكل")],
                      ["strict", t("القرآن وحدَه")],
                      ["tafssir", t("تفسيرية")],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      aria-checked={filters.mode === value}
                      className={filters.mode === value ? (value === "tafssir" ? "on copper" : "on") : ""}
                      onClick={() => setFilter("mode", value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className={`qb-chip toggle${filters.board ? " on" : ""}`}
                aria-pressed={filters.board}
                onClick={() => setFilter("board", !filters.board)}
              >
                <Icon name="graph" size={12} /> {t("بلوحة موضوع")}
              </button>
            </div>
          ) : null}

          {tags.length ? (
            <div className="tag-rail" aria-label={t("وسوم شائعة")}>
              {tags.map((entry) => (
                <button
                  key={entry.tag}
                  type="button"
                  className={`tag${filters.tag === entry.tag ? " on" : ""}`}
                  aria-pressed={filters.tag === entry.tag}
                  onClick={() => setFilter("tag", filters.tag === entry.tag ? null : entry.tag)}
                >
                  #{entry.tag}
                </button>
              ))}
            </div>
          ) : null}

          {narrowed ? (
            <div className="active-filters">
              {filters.author ? (
                <FilterPill label={t("منشورات {0}", { 0: filters.author.name })} onClear={() => setFilter("author", null)} />
              ) : null}
              {filters.tag ? <FilterPill label={`#${filters.tag}`} onClear={() => setFilter("tag", null)} /> : null}
              {filters.surah ? <FilterPill label={t("سورة {0}", { 0: surahName(filters.surah) })} onClear={() => setFilter("surah", null)} /> : null}
              {filters.mode ? (
                <FilterPill label={filters.mode === "tafssir" ? t("تفسيرية") : t("القرآن وحدَه")} onClear={() => setFilter("mode", null)} />
              ) : null}
              {filters.board ? <FilterPill label={t("بلوحة موضوع")} onClear={() => setFilter("board", false)} /> : null}
              {filters.q.trim() ? <FilterPill label={`«${filters.q.trim()}»`} onClear={() => setFilter("q", "")} /> : null}
              <button type="button" className="clear-all" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>
                {t("مسح الكل")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Portalled: the page's entrance transform would otherwise anchor `position: fixed` to it. */}
      {flash && typeof document !== "undefined"
        ? createPortal(
            <div className="qb-toast-inline qb-community-flash" role="status">
              {flash}
            </div>,
            document.body,
          )
        : null}

      {tab === "moderation" ? (
        <ModerationPanel surahName={surahName} onOpen={open} />
      ) : (
        <div className="qb-feed" aria-busy={loading}>
          {error ? <div className="qb-empty">{t("تعذّر تحميل المنشورات.")}</div> : null}
          {listTab ? (
            <>
              {posts.map((post, index) => (
                <PostCard key={post.id} post={post} surahName={surahName} onOpen={open} index={index} actions={actions} />
              ))}
              {!loading && !error && posts.length === 0 ? (
                <div className="qb-empty">
                  <Icon name={tab === "saved" ? "bookmark" : "users"} size={28} />
                  <p>
                    {narrowed
                      ? t("لا منشورات تطابق هذه التصفية.")
                      : tab === "saved"
                        ? t("لم تحفظ منشوراً بعد. اضغط رمز الحفظ على أي بحث لتجده هنا.")
                        : t("لم يُنشر بحث بعد. كن أول من يشارك تدبّره.")}
                  </p>
                  {narrowed ? (
                    <button type="button" className="qb-btn ghost" onClick={() => setFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>
                      {t("مسح التصفية")}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div ref={sentinel} className="qb-feed-sentinel" aria-hidden />
              {cursor ? (
                <button type="button" className="qb-btn ghost more" onClick={() => void loadFeed(cursor)} disabled={loading}>
                  {t("المزيد")}
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
                  <p>{t("لم تنشر بحثاً بعد. افتح بحثاً من الدفتر واضغط «نشر».")}</p>
                </div>
              ) : null}
            </>
          )}
          {loading ? <div className="qb-skeleton-list" aria-hidden><span /><span /><span /></div> : null}
        </div>
      )}

    </>
  );
  const guidelines = (
      <section id="guidelines" className="qb-guidelines qb-glass">
        <h2>{t("إرشادات المجتمع باختصار")}</h2>
        <ul>
          <li><b>{t("القرآن هو الدليل:")}</b> {t("انقل الآيات بنصّها ومرجعها، ولا تجتزئها من سياقها.")}</li>
          <li><b>{t("تدبّر لا فتوى:")}</b> {t("لا أحكام شرعية بصيغة الإلزام دون مرجع معتبر.")}</li>
          <li><b>{t("المحتوى الآلي موسوم:")}</b> {t("والقراءة التفسيرية تبقى تجريبية بتنبيهها.")}</li>
          <li><b>{t("الأدب والإنصاف:")}</b> {t("ناقش الفكرة لا الشخص، ولا طعن طائفياً.")}</li>
          <li><b>{t("الأمانة العلمية:")}</b> {t("انسب الأقوال لأصحابها واذكر درجة الحديث ومصدره.")}</li>
        </ul>
        <p className="fine">
          {t("تمرّ المنشورات بفحوص آلية ثم بمراجعة وكيل آلي استشاري، والقرار الأخير للمشرفين.")}
        </p>
      </section>
  );

  // The web design: the page spans the screen like Home — a hero band over the
  // rosette carrying the surah ribbon, then the feed beside the guidelines.
  if (web) {
    return (
      <div className="qb-community qb-community-web qb-page-enter">
        {topSlots ? createPortal(tabStrip, topSlots.start) : null}
        {topSlots ? createPortal(shareButton, topSlots.end) : null}
        <section className="qbc-hero">
          <GirihPattern className="qbc-hero-girih" drawn />
          {hero}
          {ribbon}
        </section>
        <div className="qbc-grid">
          <div className="qbc-main">{body}</div>
          <aside className="qbc-aside">{guidelines}</aside>
        </div>
      </div>
    );
  }

  return (
    <div className="qb-community qb-page-enter">
      {hero}
      {ribbon}
      {body}
      {guidelines}
    </div>
  );
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="pill">
      <span className="lbl">{label}</span>
      <button type="button" aria-label={t("إزالة {0}", { 0: label })} onClick={onClear}>
        <Icon name="close" size={11} />
      </button>
    </span>
  );
}
