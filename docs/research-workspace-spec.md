# Research workspace — themes, board, reader toolbox, contextual tafssir, research format

**Status:** implemented in phases Q-Basair-14 → 19 (see §7); the community (publishing, feed,
likes, comments, reports, moderation, AI audit) shipped in Q-Basair-19.
**Principles (AGENTS.md):** Quran text is the evidence; strict mode stays Quran-only;
Tafssir stays labelled experimental; user data is private by default; nothing here
changes search results or the strict research contract.

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
| «تحليل» (grammar insights, default) | today's behaviour: word → root, lemma, POS, iʿrāb, root occurrences |
| «تظليل» (highlight) | tap an ayah → theme picker (toggle themes, create one) |
| «تحديد» (selection) | select a word range (tap first + last word, or drag) → action bar |
| «تفسير» (contextual tafssir) | tap an ayah → Studio opens an experimental tafssir of it (§4) |

Selection actions: بحث بالعبارة · بحث بالجذر (single word) · اسأل في الدراسة (AI) ·
**إحصاء**: occurrences of the selected word/phrase and of a chosen letter in the page,
the surah and the whole Quran · نسخ مع المرجع.

Tools are registered in one place (`features/reading/tools/registry.ts`: id, label, icon,
shortcut, handlers), so new tools are additive. Toolbox UI: a slim vertical rail at the
reader's edge on desktop, a «الأداة» chooser in the reader bar on phones; keys `1…9`.

## 4. Contextual tafssir

Tafssir must read an ayah **in its context**, not in isolation.

- Every ayah sent to the tafssir stage carries `context_before` / `context_after`
  (2 ayahs each, same surah) and `surah` metadata (name, Meccan/Medinan, ayah count,
  the ayah's position in it).
- A request may target one ayah: `focus` `{mushaf, surah, ayah}`. The focus ayah is
  always kept, with ±3 neighbours and the surah metadata, and the question defaults to
  «فسّر هذه الآية في سياقها».
- The tafssir system prompt explicitly instructs: read the ayah with what precedes and
  follows it and with the surah's overall context before interpreting; say when context
  changes the reading; never interpret a fragment alone.
- Strict mode is unchanged (its final answer is still built only from search results).

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
- Export: Markdown, JSON, and **share formats** — a verse card image (the ayah in the
  Quran font, reference, optional note) and a research card (title, summary, ayah count)
  via the Web Share API / download.

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
