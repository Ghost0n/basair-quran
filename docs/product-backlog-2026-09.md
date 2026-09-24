# Q-Basair — Product backlog grounded in similar platforms (2026-09-24)

**Why this document.** After the reader rework (`feat/Q-Basair-12`), this backlog proposes
the next UX and functionality work, grounded in what comparable products ship and what
their users complain about. Each task names the evidence, what exists in Q-Basair today,
the proposed change, and a size (S ≤ 1 day · M 2–4 days · L ≥ 1 week).

**Positioning.** Q-Basair is not another general Quran app. Its edge is **search and
study**: word / root / phrase concordance on an authentic Madani page, morphology on tap,
and a strict, Quran-grounded research agent. The backlog therefore favours (1) closing
reading-comfort gaps users now take for granted, and (2) deepening the research edge where
incumbents are weak — while keeping strict mode Quran-only (AGENTS.md).

## 1. What the market says

| Platform | What users value | Pain points / gaps reported |
|---|---|---|
| Quran.com (web + apps) | "Gold standard", ad-free, Madani pages, audio, bookmarks + notes that sync across devices; reading goals + streaks ("Quran Growth Journey") | Feature fatigue; users ask for **tajweed colours**, **zoom / bigger font**, and **back-navigation that keeps the same verse** (for memorisation); 1,248 open feature requests on its public board |
| Quran for Android | Free, open source, the default Madani reader | Minimal study depth; verse-highlight behaviour questions in its issue tracker |
| Al Quran (Greentech) | Tap any word → meaning, **root, lemma, grammar**; 8 Arabic tafsirs (Ibn Kathir, Tabari…), iʿrāb, asbāb al-nuzūl; khatmah planner, goals, badges; audio **repeat + group playback** | Past reports of **lost bookmarks** after updates (fixed in a rebuild) |
| Tarteel AI | Recitation feedback; "hidden verses" hifz mode | Paid tiers; memorisation-centric, not research |
| Ayah / Ayat (KSU) | Free, academically robust, authentic mushaf, **reliable ayah looping** | — |
| Quranic Arabic Corpus | Morphological concordance (POS, stem, lemma, root) | Asks for **pattern (wazn) search**, all particles incl. one-letter ones, proper nouns in the dictionary; expert-level UI |
| Tanzil / IslamiCity / الباحث القرآني | Diacritic-insensitive phrase + root search; **occurrence statistics**; tafsir, qirāʾāt, iʿrāb; shared khatmah | Morphological search is hard for non-specialists |
| QuranReflect / Qurannotate / Quran.com Notes | Reflections, notes on ayah/word, tags, private groups | — |
| AI "Islamic chatbots" (research literature 2025–26) | — | **Hallucinated or misattributed verses**, fabricated citations, inconsistent answers; experts demand **provenance, transparency, uncertainty and human oversight** |

## 2. Where Q-Basair stands

Already strong: authentic Madani reader (3 modes, focus mode, swipe, instant turns),
diacritic-safe word/root/phrase search with highlights and "did you mean", morphology on
tap, root distribution map, notebook + sessions + followed roots (account-synced), resume
at the exact verse, recitation with single-ayah repeat, strict research agent grounded in
Quran search, Markdown/JSON export, web manifest.

Missing versus the market: classical tafsir text, word meanings, tajweed colours,
range repeat / hifz aids, reading plans, offline use, verse sharing as an image, pattern
search, research-grade statistics export, verifiable citations in AI answers.

## 3. Backlog

Priority: **P1** next release · **P2** following · **P3** later.

### A. Reading comfort (close the table-stakes gaps)

| # | P | Task | Evidence | Today | Size |
|---|---|---|---|---|---|
| A1 | P1 | **Back keeps the verse.** Browser Back from search/notebook/Studio returns to the exact verse and scroll position; the reader history records jumps (not page turns). | Quran.com review: "better navigation when pressing back to keep on the same verse" | resume works on reload; Back after a jump lands on the page top | S |
| A2 | P1 | **Pinch-to-zoom on the Madani page** (touch) and Ctrl +/− (desktop) mapped to the text-size preference, with a "reset" chip. | "zoom feature or bigger font" request | size slider in «العرض» only | S |
| A3 | P1 | **Range repeat for recitation:** repeat an ayah N× (1–∞), repeat a range (from–to) N×, pause between repeats; start from the long-press / morphology popover. | Greentech "repeat + group playback", Ayah "reliable looping", hifz apps (range × 99) | single-ayah repeat toggle | M |
| A4 | P2 | **Follow-along highlight** of the recited ayah on the page, auto-turning the page with the audio (ayah-level first; word-level later with timing data). | Quran.com word-by-word audio sync; T8.1 design note | media bar plays; no page highlight | M |
| A5 | P2 | **Tajweed edition** in «المصحف» (Madani Ḥafṣ with tajweed colours, QPC V4 tajweed fonts) — the edition catalogue already supports adding it. | Top app-store request ("tajweed colors like in other apps") | single Madani edition | M (data + licence check) |
| A6 | P2 | **Offline reading (PWA):** service worker caching the app shell, the last N pages + their fonts, and "download this juz" for travel. | Offline is standard in every mobile Quran app | manifest only, no SW | M |
| A7 | P3 | **Night reading:** warm "sepia" theme + auto theme by time; true-black OLED variant. | Mushaf apps offer multiple page themes | dark / light | S |

### B. Understanding the text (the study edge)

| # | P | Task | Evidence | Today | Size |
|---|---|---|---|---|---|
| B1 | P1 | **Classical tafsir panel** per ayah: التفسير الميسّر, السعدي, ابن كثير (public-domain Arabic texts), shown beside the page; one tap from the morphology popover and the verse row. Strictly separate from the AI Tafssir mode. | Greentech ships 8 Arabic tafsirs; tafsir.app / الباحث القرآني | only AI Tafssir (experimental) | L (data pipeline + UI) |
| B2 | P1 | **Word meaning in the morphology popover** (غريب القرآن / Arabic lexicon gloss) alongside root, lemma, POS, iʿrāb. | Greentech "tap any word → meaning, root" | root / lemma / POS / iʿrāb | M (data) |
| B3 | P2 | **Root → derivatives view:** every lemma of a root with counts and the verses, grouped by form (verb forms I–X, nouns). | QAC concordance; Greentech "root and derivatives" | root search + distribution map | M |
| B4 | P2 | **Pattern (wazn) and POS filters** in search, in plain Arabic ("أسماء الفاعل من الجذر…"), not codes. | QAC users ask for pattern search; non-experts find morphological search hard | exact / root / phrase | M |
| B5 | P3 | **Qirāʾāt differences note** on an ayah when other riwāyāt differ (data already in the DB for 6 riwāyāt). | الباحث القرآني shows qirāʾāt | riwāyāt hidden in v1 | M |

### C. Research workflow

| # | P | Task | Evidence | Today | Size |
|---|---|---|---|---|---|
| C1 | P1 | **Verifiable AI citations:** every ayah quoted in a Studio answer is checked deterministically against the DB text; unmatched quotes are flagged, not shown as Quran. Answers show "N ayahs cited, all verified". | Research: hallucinated/misattributed verses, fabricated citations; experts demand provenance | strict mode grounds context; no post-hoc quote check | M |
| C2 | P1 | **Concordance export** (CSV / Markdown): all occurrences of a word/root with reference, page, surah type — plus the per-surah counts. | الباحث القرآني statistics; researchers need data out | Studio export only | S |
| C3 | P2 | **Notes and tags on ayahs** (and on words), searchable, exportable; notebook collections become tags. | Quran.com Notes, QuranReflect, Qurannotate | save + collection on verses | M |
| C4 | P2 | **Share a verse as an image** (authentic glyph rendering, reference, optional note) and as text with the exact reference. | Standard in reading apps; social sharing | copy / export only | S |
| C5 | P3 | **Shared study spaces:** share a research session or a notebook collection read-only by link. | QuranReflect groups; الباحث القرآني shared khatmah | private only | M |

### D. Habit

| # | P | Task | Evidence | Today | Size |
|---|---|---|---|---|---|
| D1 | P2 | **Khatmah planner:** pick a finish date or pages/day, daily target from the current position, progress on Home; gentle, no gamified pressure by default. | Greentech planner, Quran.com Growth Journey, Muslim Pro khatam | resume + saved pages | M |
| D2 | P3 | **Reading history** (last 30 days: pages, time) on Home, private. | Quran.com streaks; QuranStreak | last position only | S |

### E. Platform quality

| # | P | Task | Evidence | Today | Size |
|---|---|---|---|---|---|
| E1 | P1 | **Data safety:** never lose bookmarks/notes — export/import of all personal data (JSON), plus automated backups already scripted. | Greentech "lost bookmarks" incident | backup script (server) | S |
| E2 | P2 | **Screen-reader pass on the reader** with VoiceOver/TalkBack (glyph words already expose real text); verse-level navigation shortcuts. | Accessibility is weak across Quran apps | ARIA groundwork done (Q-Basair-8) | M |
| E3 | P2 | **Real-device QA matrix** (iOS Safari, Android Chrome, iPad) for gestures, safe areas, audio background play. | — | headless verification only | S |

## 4. Suggested next release (P1)

A1 · A2 · A3 · B1 · B2 · C1 · C2 · E1 — about 3–4 weeks. B1/B2 need data sourcing and
licence checks first (public-domain tafsir texts; lexicon source).

## Sources

- [Quran.com app — App Store listing and reviews](https://apps.apple.com/us/app/quran-by-quran-com-%D9%82%D8%B1%D8%A2%D9%86/id1118663303)
- [10 Best Quran Apps 2026 (dralirajabi.com)](https://dralirajabi.com/best-quran-apps-2026/)
- [Best Quran App 2025 — Quran In Depth](https://www.quranindepth.com/blog/best-quran-app-2025-reviews)
- [Mushaf Mode — Greentech Apps Foundation](https://gtaf.org/blog/mushaf-mode-in-quran-app/)
- [Al Quran (Tafsir & by Word) — Google Play](https://play.google.com/store/apps/details?id=com.greentech.quran&hl=en)
- [Al Quran (Tafsir & by Word) — App Store](https://apps.apple.com/us/app/al-quran-tafsir-by-word/id1437038111)
- [Best Quran Memorization Apps 2026 — quranicma.com](https://quranicma.com/best-quran-memorization-apps-2026/)
- [5 Best Quran Apps 2026 — RecitID](https://recitid.ai/guides/best-quran-apps)
- [Best Quran App for Android 2026 — Quran Gate](https://qurangate.app/blog/best-quran-app-android)
- [Quranic Arabic Corpus — Morphological Search](https://corpus.quran.com/morphologicalsearch.jsp)
- [Quranic Arabic Corpus — McGill Islamic Studies Library blog](https://blogs.library.mcgill.ca/islamicstudieslibrary/the-quranic-arabic-corpus/)
- [Tanzil — Quran Navigator](https://tanzil.net/)
- [الباحث القرآني — Google Play](https://play.google.com/store/apps/details?id=com.lifecs.quran&hl=en_US)
- [الباحث القرآني — tafsir.app](https://tafsir.app/)
- [Quran.com Feedback — Feature Requests](https://feedback.quran.com/feature-requests)
- [quran/quran_android — Issues](https://github.com/quran/quran_android/issues)
- [Quran.com — Take Notes](https://quran.com/en/take-notes)
- [QuranReflect — App Store](https://apps.apple.com/us/app/quranreflect/id1444969758)
- [Qurannotate](https://qurannotate.com/)
- [Quran.com — Quran Growth Journey (streaks)](https://quran.com/en/product-updates/quran-reading-streaks)
- [Quran Streak — Google Play](https://play.google.com/store/apps/details?id=com.quranstreak)
- [Muslim Pro — Plan your own Khatam](https://support.muslimpro.com/hc/en-us/articles/4813190002585-How-to-Plan-My-Own-Khatam)
- [Quran - Mushaf Mecca — App Store (sync features)](https://apps.apple.com/us/app/quran-mushaf-mecca-%D9%85%D8%B5%D8%AD%D9%80%D9%81-%D9%85%D9%83%D8%A9/id1438777424)
- [AI and Authenticity in Islamic Research (arXiv 2607.28237)](https://arxiv.org/html/2607.28237)
- [Islamic Chatbots in the Age of LLMs (arXiv 2601.06092)](https://arxiv.org/pdf/2601.06092)
- [AI in Islamic Guidance — Journal of Digital Islamicate Research (2025)](https://doi.org/10.1163/27732363-20250003)
