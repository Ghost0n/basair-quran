# Research workspace — themes, board, reader toolbox, contextual tafssir, research format

**Status:** implemented in phases Q-Basair-14 → 19 (see §7); the community (publishing, feed,
likes, comments, reports, moderation, AI audit) shipped in Q-Basair-19, feed search/filters and
saved posts in Q-Basair-23, and the artifacts studio in Q-Basair-24.
**Principles (AGENTS.md):** Quran text is the evidence; the research agent is Quran-only;
user data is private by default; nothing here changes search results or the research
contract.

**Update (Q-Basair-109):** the experimental explanatory reading (Tafssir mode) and the
research corpus it drew on were removed; the agent now answers from the Quran alone. The
context rule of §4 (each ayah read with its neighbours and its surah) and the focus ayah
were kept and now apply to every answer. Documents and posts made in the old mode keep
their disclaimer (§5–6).

## 1. Themes (المواضيع) — saving becomes grouping

Saving an ayah is no longer passive: the researcher **highlights** it with one or more
**themes**, each a name + colour. Grouping by subject happens as a side effect of reading.

- A theme: `{id, name, color, description?, board?, created_at, updated_at}` owned by a
  user (guests too, scoped by `guest_id` like the notebook).
- An ayah can carry several themes (many-to-many `notebook_item_themes`). A saved ayah
  without a theme is still allowed ("محفوظ" — general).
- Colour is a key from a fixed 8-colour palette (`gold, sand, green, teal, blue, violet,
  rose, grey`) so highlights stay legible on both themes and on the glyph page.
- The reader paints each highlighted ayah with its theme colour (first theme; a small
  multi-dot marker when it carries more). «العرض» → «إظهار التظليل» turns it off.
- Migration: existing notebook `collection` strings become themes (one per distinct
  name, colours assigned in order); `collection` stays readable for compatibility.

API: `GET/POST /api/themes`, `PATCH/DELETE /api/themes/{id}`,
`PUT /api/notebook/{item_id}/themes` (replace the item's theme ids),
`POST /api/notebook` accepts `theme_ids`. Notebook items return `theme_ids`.

## 2. Theme board (لوحة الموضوع) — the graph of a theme

A canvas page per theme (`/?mode=board&theme=<id>`) showing its ayahs as nodes the
researcher arranges, links and annotates.

- **Nodes:** `ayah` (one per ayah in the theme, created automatically, removed when the
  ayah leaves the theme), `note` (free text), `heading` (a label/zone title).
- **Edges:** user-drawn relations with an optional label; quick labels:
  «يفسّر» «يؤكّد» «يقابل» «سبب/نتيجة» «مثال» + free text.
- **Ayah node:** reference + text; **expand** turns it into a scrollable mini reader
  (the ayah with ±5 neighbours, same surah, loaded on demand), collapse back.
- **Persistence:** the whole board (`{v:1, nodes:[{id,type,x,y,w?,h?,data}], edges:[…],
  viewport}`) is stored as `themes.board` (JSON, ≤ 256 KB), autosaved (debounced). The viewport is
  not persisted (always fit on open) since it depends on the device.
  It is metadata of the theme: deleting the theme deletes its board.
- Library: React Flow (`@xyflow/react`, MIT) — pan/zoom, drag, connect, minimap,
  keyboard; RTL labels inside nodes.

## 3. Reader toolbox — the interaction depends on the tool

A small, extensible set of tools changes what a tap/click on the text does. One tool is
active at a time; the choice is remembered per device.

| Tool | Action on the text |
|---|---|
| «تحديد» (selection, default) | tap a word → it is selected and its analysis (root, lemma, POS, iʿrāb) shows in the action bar; each tap selects only what it lands on — another word replaces it (no run between two taps), the same word again lets it go; tap the verse-number ornament → the whole verse |
| «تظليل» (highlight) | tap any word of an ayah (or its number) → the whole verse is selected and the theme picker opens (toggle themes, create one) |

2026-09 revision: the former «تحليل» tool merged into «تحديد» (a single picked word carries
the analysis), and the «تفسير» tool was retired from the reader — contextual tafssir is asked
from the Studio (§4). The per-verse save bookmark is gone; «تظليل» is the save path.

Selection actions: بحث بالعبارة · بحث بالجذر (single word) · اسأل في الدراسة (AI) ·
**إحصاء**: occurrences of the selected word/phrase and of a chosen letter in the page,
the surah and the whole Quran · نسخ مع المرجع.

Tools are registered in one place (`features/reading/tools/registry.ts`: id, label, icon,
shortcut, handlers), so new tools are additive. Toolbox UI: a slim vertical rail at the
reader's edge on desktop, a «الأداة» chooser in the reader bar on phones; keys `1…9`
(today `1` = تحديد, `2` = تظليل).

## 4. Ayahs read in context (formerly «contextual tafssir»)

The answer must read an ayah **in its context**, not in isolation.

- Every ayah sent to the final stage carries `context_before` / `context_after`
  (1 ayah each, same surah) and `surah` metadata (name, Meccan/Medinan, ayah count,
  the ayah's position in it).
- A request may target one ayah: `focus` `{mushaf, surah, ayah}`. The focus ayah is
  always kept, with ±5 neighbours and the surah metadata.
- The final-stage system prompt instructs: read each ayah with what precedes and
  follows it; say when the passage narrows or changes the meaning; never use a fragment
  alone. The answer is still built only from the ayahs search returned (neighbours are
  context, not evidence).

## 5. Research documents — the shareable format, prepared now

Social sharing comes later; its content format is fixed now so everything written from
today is already publishable.

```text
ResearchDocument v1
  id, title, summary, language, tags[], theme_ids[]
  sections[]: { id, kind: "text" | "ayahs" | "note" | "question" | "ai_answer",
                title?, body (markdown subset), ayahs[]: AyahRef }
  references[]: { kind: "ayah" | "tafsir" | "book" | "url", label, locator }
  provenance: { mode: "strict" | "tafssir" | null, ai_sections: [section ids],
                created_from: "studio" | "board" | "manual" }
  visibility: "private" (default) | "unlisted" | "public"
  created_at, updated_at, version
AyahRef = { mushaf_id, surah_id, ayah, ayah_id, text }   // text verified against the DB
```

- Sources: a Studio session («حوّل إلى بحث») and a theme board («صدّر كبحث») convert into a
  document; documents are editable (title, summary, section notes, order).
- Every `AyahRef.text` is verified against the database on save (see §6.2); AI sections
  are flagged, and a Tafssir-mode document carries the experimental disclaimer.
- Export: Markdown, JSON, and the **«مشاركة» studio** (Q-Basair-24), opened from a document or
  a community post, with a live preview:
  - **research card** (title, summary, ayah/surah count, author, first ayah);
  - **verse card** (any quoted ayah with its reference, optionally its section's note — an
    AI-generated note is labelled «ملاحظة مولَّدة آلياً»);
  - **carousel** (سلسلة شرائح): a cover, one slide per quoted ayah (the section's note on its
    first ayah), a closing slide (the post link when published) — at most 10 slides, numbered;
    shared as several images or downloaded as a ZIP;
  - **print / PDF**: a clean A4 rendition (title, summary, ayahs in the Quran face, notes,
    references, footer) through the browser's print dialog.
  - Sizes 4:5 (1080×1350), square (1080×1080) and story (1080×1920); styles «ليلي», «ورقي»,
    «زمرّدي» — remembered per device. A Tafssir-mode research carries «قراءة تفسيرية تجريبية»
    on the cover and closing slide, and the disclaimer in print. Everything renders locally on
    a canvas (no network).

## 6. Community (later) — guidelines and the AI audit, designed now

### 6.1 Guidelines
`docs/community-guidelines.md` (Arabic): respect, evidence-first, no fatwas, label
personal reflection vs. scholarship, cite ayahs exactly, no sectarian attacks, no
promotion; AI-generated content must be labelled.

### 6.2 Audit before publishing
A document can only become `public` after an audit:
1. **Deterministic checks (blocking):** every quoted ayah matches the DB text for its
   reference; references resolve; AI sections are labelled; Tafssir documents carry the
   disclaimer; size/format limits.
2. **AI audit agent (advisory → moderator queue):** checks against the guidelines —
   misattributed or invented verses, claims presented as rulings, disrespectful language,
   unsupported interpretive claims. Output `{verdict: pass|review|reject, issues:[{section,
   rule, explanation}]}`; `review` goes to a human moderator; the author sees the reasons.
3. Human moderation stays the final authority; the agent never publishes on its own.

## 7. Phases

| Phase | Branch | Content |
|---|---|---|
| 1 | `feat/Q-Basair-14-tafssir-contexte` | contextual tafssir (neighbours + surah) + focus-ayah request |
| 2 | `feat/Q-Basair-15-themes` | themes + highlight colours on the reader + notebook grouping + migration |
| 3 | `feat/Q-Basair-16-toolbox` | toolbox registry + grammar / highlight / selection / tafssir tools + counts |
| 4 | `feat/Q-Basair-17-lavoie-theme` | theme board (graph) with notes, relations, mini readers |
| 5 | `feat/Q-Basair-18-format-recherche` | research document format + conversions + share formats + quote verification + guidelines + audit design |
| 6 | `feat/Q-Basair-19-communaute` | publishing pipeline, AI audit agent, feed, post pages (document + read-only board), likes, comments, reports, moderation |
| 7 | `feat/Q-Basair-23-fil-communaute` | feed: latest/trending, search, filters (surah, tag, mode, board, author), saved posts, link sharing, infinite scroll |
| 8 | `feat/Q-Basair-24-artefacts-recherche` | «مشاركة» studio: research/verse cards in 3 sizes and 3 styles, carousel (ZIP / multi-image share), print / PDF |
