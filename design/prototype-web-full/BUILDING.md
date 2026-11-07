# Basair web prototype: how to build a screen

A clickable prototype of the whole Basair web app in the visual language of the public
landing page (`apps/web/features/site/landing/`). It runs on real Quran data exported
from the local API. Plain HTML/CSS/JS, no build step, no libraries.

Run it: `python -m http.server 3012` in this folder, open `http://127.0.0.1:3012/local.html#<screen>`.
`python build-local.py` regenerates `local.html` from `index.html` after you edit `index.html`.
(`index.html` is the publishable form: no `<html>/<head>/<body>` wrapper.)

## Files

- `core.css`: tokens (dark first + parchment light) and every shared component. Read it before writing CSS.
- `core.js`: `window.QB`, the API below. Read it before writing JS.
- `screens/home.js` + `screens/home.css`: the reference screen. Copy its conventions.
- `screens/<name>.js` + `screens/<name>.css`: one pair per screen. You only create/edit your own pair.
- `data/*.js`: real data. Never edit. Access it only through `QB` helpers.

## Design rules (non-negotiable)

1. **Tokens only.** Never write a hex/rgb colour in a screen file. Use `var(--…)` from `core.css`.
   Both themes must work: check every surface in light (`data-theme="light"`) and dark.
2. **Gold means "you" or "act".** Your place, your selection, primary actions, matched words. Not decoration.
   Semantic colours (`--ok/--warn/--bad/--info` and `.pill.ok` etc.) only for state.
3. **Type.** Quran text: `var(--font-quran)` (Amiri Quran), never in a gradient, line-height ≥ 2.
   Headings: `var(--font-head)` (Amiri, `.h2`/`.h3`). UI: Cairo (inherited). Numbers via `QB.n()` (honours
   the numerals setting). Big figures: `.figures` or `.gold-num`. Root letters: `.letters` + `QB.letters(root)`.
4. **The signature devices** come from the landing page and are the app's identity:
   - the 114-bar **ribbon** (`QB.ribbon`, `QB.wireRibbon`, `QB.miniRibbon`): the one instrument for
     "where in the Quran". Use it wherever a distribution across surahs is meaningful.
   - the **rosette** (`QB.girih()`): once per screen at most, as quiet structure, never as wallpaper.
   - **word-by-word** reveal (`.word-in` + `--w`): only for a hero verse.
   Spend boldness in one place per screen; keep the rest quiet.
5. **No SaaS card kit.** Don't chop content into identical rounded cards with shadows. Prefer hairline
   lists (`.list` + `.row`), open layouts, and one `.panel` where a region genuinely is a separate object.
   Radii by role: controls `--r-ctl`, panels `--r-panel`, pills 999.
6. **No template tells**: no ALL-CAPS eyebrows, no `01 / 02 / 03` unless it is truly a sequence, no
   emoji, no "→" appended to labels, no meta strings joined with " · ".
7. **Copy.** Arabic UI first, from the user's side ("احفظ"، "انشر"، "تابع القراءة"). Use the production
   labels from the inventory where they exist. Errors say what happened and what to do. Empty states
   invite an action. Sentence-level Arabic punctuation (، ؛ ؟).
8. **RTL.** The app root is `direction: rtl`. Logical properties (`margin-inline-start`, `inset-inline`)
   over left/right. "Next" in a mushaf goes to the left (`chevL`).
9. **Quality floor**: keyboard focus visible (core handles `:focus-visible`), every icon-only button has
   `aria-label`, form controls have labels and stable `id`s, `prefers-reduced-motion` respected (core
   handles it), no horizontal page scroll down to 400px wide (stack columns under 1080px / 720px).
10. **Prototype honesty.** When something isn't backed by loaded data, say so in the UI in one short,
    calm line (e.g. "في هذا النموذج حُمّلت صفحات ١، ٢، ٤٩٩–٥٠١ فقط"). Don't fake network features
    silently: simulated actions update in-memory state and confirm with `QB.toast`.

## What to build: INVENTORY.md

`INVENTORY.md` lists every screen, label, action and state of the production web app. The prototype must
hold **all of it** for your screens, with the production Arabic labels, redrawn in the new language. Where
the new design improves a flow (e.g. the ribbon as a filter, a study panel), keep the production capability too.

## Information architecture: the Mushaf is the room

On wide screens (>1000px) the Mushaf stays on screen and Search, Study, Notebook, Index and Saved open as a
**panel beside it** (production behaviour). Register those screens with `room: 'panel'`; the Reader uses
`room: 'mushaf'`. `el` passed to `mount/show` is then the panel. Under 1000px a `'panel'` room shows only the
panel and verse taps go to the Reader. Full-width screens (Home, Heatmap, Board, Document, Community, Post,
Settings, Account) don't set `room`.

- Open a verse from a panel with `QB.openVerse(s, a)`: it moves the Mushaf beside the panel when visible,
  otherwise goes to the Reader.
- `QB.room.toggleButton()` gives a header button that widens the panel to full width (hides the Mushaf) and back.
- `world`: `'reading'` (gold, default), `'research'` (teal: search, study, notebook, board, document),
  `'community'` (copper: community, post). `--world` / `.kicker` pick it up. Gold still means "you/act".

### QB.mushaf (built by screens/reader.js, used by everyone)

```js
QB.mushaf.el                          // the stage element; core moves it into the active room
QB.mushaf.goTo({page} | {s, a}, {flash})   // show that page; flash = briefly light the verse
QB.mushaf.current()                   // {page, s, a}
```

## Shared state and helpers (core.js)

`QB.state.savedPages [{page, at}]`, `themes [{id,name,color}]`, `notebook [{id,s,a,themes[],at}]`,
`boards [{id,themeId,name,at, nodes?, edges?}]`, `sessions [{id,title,mode:'strict'|'tafsir',at,count, messages?}]`,
`documents [{id,title,from:'board'|'studio'|'blank',boardId?,sessionId?,at,status, sections?, refs?}]`,
`followedRoots [root]`, `posts` (community.js seeds it if absent), `user {name,email,role:'admin',medal}` | `{guest:true}` | null,
`homeSections`, `themeHighlight`, `readingMode`, `quranSize`, `translations`.
Mutate the arrays in place (or reassign via `QB.set`) and `QB.emit('notebook')` etc. when others may care.

`QB.age(iso)` relative age ("أمس"، "قبل ٣ أيام"); `QB.uid(prefix)`; `QB.theme(id)`; `QB.thColor(key)` → `var(--th-key)`;
`QB.signedIn()`; `QB.requireAccount(what, fn)` (production gate dialog); `QB.saveAyah(s, a)` (the «حفظ وتظليل»
sheet; use it for every "save verse / pin" action); `QB.noteOf(s, a)`; `QB.params()`; `QB.shortcuts()`.

## File ownership

| Files | Screens (`QB.screen` names) |
|---|---|
| core.*, screens/home.* | shell, rail, player, save sheet, gate, `home` |
| screens/reader.* | `QB.mushaf`, `reader` |
| screens/navigate.* | `index`, `saved`, and `QB.navigator(el, {tab, onPick})` used by the Reader's «انتقل» sheet |
| screens/search.* | `search` (concordance panel), `heatmap` |
| screens/study.* | `study` |
| screens/notebook.* | `notebook` |
| screens/document.* | `document` |
| screens/board.* | `board` |
| screens/community.* | `community`, `post` |
| screens/settings.* | `settings`, `account` (login / signup / forgot / reset / welcome) |

Navigate to another builder's screen by name with `QB.go(name, params)`; params you may pass:
`reader {page | s,a,p}`, `search {q, mode:'root'|'exact'}`, `heatmap {root}`, `study {session | ask | focus:{s,a}}`,
`notebook {tab, focus}`, `document {id}`, `board {id}`, `community {tab, tag, surah}`, `post {id}`,
`settings {section}`, `account {tab:'login'|'signup'|'forgot'|'reset'|'welcome'}`, `index {tab}`.

## QB API (core.js)

```js
QB.screen(name, { title(params) -> [title, subtitle], mount(el), show(el, params), hide?(el) })
QB.go(name, params)              // navigate; params are free-form; hash becomes #name
QB.current()                      // current screen name
QB.on(event, fn) / QB.emit(event, payload)   // events: 'state' {key,value}, 'route', 'rec' {on,s,a,word}
QB.state                          // theme, numerals, uiLang, narration, reciter, speed, repeat,
                                  // translations ['english'|'french'], readingMode 'page'|'ayahs',
                                  // quranSize, user {name,handle,role}|{guest:true}|null, lastRead, bookmarks[]
QB.set(key, value)                // update state + emit 'state'
QB.n(x)                           // numerals per setting
QB.esc(s), QB.strip(s), QB.words(text), QB.letters(root), QB.$(sel, root), QB.$$(sel, root)
QB.ico(name, cls)                 // icons: see QB.icons in core.js; add your own: QB.icons.foo = '<path…/>'
QB.mark(size)                     // the Basair mark
QB.girih(cls), QB.ribbon(counts, {here, focus, flat, live, grow, id, label}), QB.miniRibbon(counts)
QB.wireRibbon(ribEl, readoutEl, text(i), onPick(i|null)?, restText()?)
QB.toast(msg), QB.soon(featureName)
QB.sheet({title, width?, render(bodyEl, close)})   // side sheet from the left
QB.modal({render(bodyEl, close)}), QB.confirm({title, body, confirm, danger, onConfirm})
QB.closeOverlays()
QB.player.start({ayahs:[{s,a,text}], idx}), QB.player.toggle(), QB.player.stop(), QB.player.state

// Data
QB.data.stats            // {surahs:114, ayahs:6236, words:77430, roots:1651, pages:604, reciters:8}
QB.data.names            // 114 surah names (Arabic, with diacritics)
QB.data.index            // [{id, name, en, type:'meccan'|'medinan', ayahs, page, juz}] ×114
QB.data.juz              // [{n, s, a, page}] ×30
QB.data.mushafs          // narrations [{id, name, description, riwayah}] (2 = حفص)
QB.data.reciters         // [{id, name, en, style, audio}]
QB.data.translations     // 55 [{key, lang, name}]
QB.surah(id)             // index entry
QB.pageNumbers           // [1, 2, 499, 500, 501]  ← the only pages with text
QB.page(n)               // {n, juz, surahs:[{id,name}], ayahs:[{s,a,text}]} or null
QB.pageOf(s, a), QB.ayah(s, a)
QB.morph(s, a)           // words [{text, root, lemma, pos_label, case_label, features[]}] for loaded pages
QB.trans(s, a)           // {english, french} for loaded pages
QB.spread(root)          // {root, total, surahs, counts[114]} for ~150 roots
QB.search(root)          // {root, total, verses_total, surahs, verses:[{s,name,a,text,hl:[1-based word positions]}]}
QB.searchRoots()         // roots with result lists: بصر هدي رحم يقن قوم أنس علم نور صبر قلب
QB.allRoots(), QB.findRoot(q)
```

Highlights in search verses are **1-based** word positions: `QB.words(v.text)[k - 1]`.

Class-name note: core's screen-reader utility is `.sr`, so Search uses `sr-…` classes but never a bare `.sr`.

## Screen file template

```js
(() => {
  const { n } = QB;
  QB.screen('name', {
    title: (p) => ['العنوان', 'سطر فرعي'],
    mount(el) { el.addEventListener('click', (e) => { /* delegate on [data-act] */ }); },
    show(el, params) { el.innerHTML = `<div class="wrap">…</div>`; /* wire non-delegated things */ },
  });
})();
```

CSS: prefix every class with your screen's prefix (`rd-`, `ix-`, `sv-`, `sr-`, `st-`, `nb-`, `cm-`, `set-`, `ib-`).
Reuse core classes (`.wrap`, `.panel`, `.list/.row`, `.cta/.ghost/.quiet/.icon-btn/.link`, `.tabs`, `.chip(s)`,
`.pill`, `.facts`, `.field/.input/.select/.textarea/.switch/.seg-ctl`, `.figures`, `.block-title`, `.label`,
`.empty-state`, `.marker`, `mark.hit`) before inventing new ones.

## Verify before you hand back

- Open your screen at 1440×900 and at 400px wide, in dark and light. No console errors.
- Exercise every control once. Report what you built, what is simulated, and anything you could not do.
