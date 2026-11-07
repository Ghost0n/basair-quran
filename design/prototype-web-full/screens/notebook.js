/* Notebook (الدفتر): everything you kept. Saved verses with their topic themes, theme boards,
   research documents, study sessions and followed roots. A panel beside the Mushaf on wide screens.
   Params: {tab: 'verses'|'boards'|'documents'|'sessions'|'roots', focus: themeId}. */
(() => {
  const { n, esc } = QB;
  const TABS = [
    ['verses', 'الآيات'], ['boards', 'اللوحات'], ['documents', 'الأبحاث'], ['sessions', 'الجلسات'], ['roots', 'الجذور'],
  ];
  const ui = {
    tab: 'verses',          // reopens on the last tab used
    view: 'recent',         // الآيات: 'recent' | 'theme'
    surah: null,            // by-theme view: ribbon filter (surah index 0–113) or null
    open: new Set(),        // mini verses shown in full
    sessFilter: 'all',      // 'all' | 'strict' | 'tafsir'
    focus: null,            // theme to scroll to and light once (boards tab)
    creating: null,         // themeId whose «لوحة جديدة» form is open
    renaming: null,         // boardId being renamed inline
    asking: null,           // boardId whose inline delete confirmation is open
    undo: null,             // {msg, fn}
  };
  let el = null, undoT = null, raf = 0, focusKey = null;

  /* ---------- helpers ---------- */
  const S = () => QB.state;
  // Arabic counted nouns (feminine): 1 → «آية واحدة»; 2 → dual; 3–10 → plural; 0 and 11+ → singular.
  const count = (k, one, two, few) => (k === 1 ? `${one} واحدة` : k === 2 ? two : k >= 3 && k <= 10 ? `${n(k)} ${few}` : `${n(k)} ${one}`);
  const ayat = (k) => count(k, 'آية', 'آيتان', 'آيات');
  const versesOf = (themeId) => S().notebook.filter((v) => v.themes.includes(themeId));
  const byDate = (arr) => [...arr].sort((x, y) => new Date(y.at) - new Date(x.at));
  const ref = (s, a) => `${QB.surah(s).name} ${n(a)}`;
  const snip = (text, k) => { const w = QB.words(text); return w.length > k ? w.slice(0, k).join(' ') + '…' : text; };
  const dots = (ids) => ids.map(QB.theme).filter(Boolean).map((t) => `<span class="th-dot" style="--c:${QB.thColor(t.color)}" title="${esc(t.name)}"></span>`).join('');
  const dotNames = (ids) => ids.map(QB.theme).filter(Boolean).map((t) => t.name).join('، ');
  const msgCount = (s) => (Array.isArray(s.messages) ? s.messages.length : s.count || 0);
  // Sections and verses of a research document. document.js fills `sections` on first open; until then
  // the figures are estimated from the document's source (its board's theme or its study session).
  const docStats = (d) => {
    if (Array.isArray(d.sections)) {
      const refs = d.sections.reduce((k, x) => k + ((x && (x.refs || x.ayahs || x.verses)) || []).length, 0);
      return [d.sections.length, refs];
    }
    if (d.from === 'board') { const b = S().boards.find((x) => x.id === d.boardId); const k = b ? versesOf(b.themeId).length : 0; return [k ? 3 : 1, k]; }
    if (d.from === 'studio') { const s = S().sessions.find((x) => x.id === d.sessionId); const k = s ? msgCount(s) : 2; return [k, k * 2]; }
    return [0, 0];
  };
  const STATUS = { draft: ['mute', 'مسودة'], published: ['ok', 'منشور'], review: ['warn', 'قيد المراجعة'], pending: ['warn', 'قيد المراجعة'], changes: ['warn', 'مطلوب تعديل'] };

  /* ---------- undo bar (QB.toast has no action, so the notebook carries its own) ---------- */
  const offerUndo = (msg, fn, viaKeyboard) => {
    clearTimeout(undoT);
    ui.undo = { msg, fn };
    if (viaKeyboard) focusKey = 'undo';
    undoT = setTimeout(() => { ui.undo = null; el?.querySelector('.nb-undo')?.remove(); }, 7000);
  };

  /* ---------- rendering ---------- */
  const rerender = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };

  function head() {
    const st = S();
    return `<header class="nb-head">
        <div>
          <span class="kicker">ما جمعتَه</span>
          <h2 class="h2 nb-title">الدفتر</h2>
          <p class="label nb-counts">${n(st.notebook.length)} آية، ${n(st.documents.length)} بحث، ${n(st.sessions.length)} جلسة، ${n(st.followedRoots.length)} جذر</p>
        </div>
        ${QB.room.toggleButton()}
      </header>
      <div class="tabs nb-tabs" role="tablist" aria-label="أقسام الدفتر">${TABS.map(([k, l]) => {
        const c = { verses: st.notebook.length, boards: st.boards.length, documents: st.documents.length, sessions: st.sessions.length, roots: st.followedRoots.length }[k];
        return `<button role="tab" id="nb-tab-${k}" aria-controls="nb-pane" aria-selected="${ui.tab === k}" tabindex="${ui.tab === k ? 0 : -1}" data-act="tab" data-tab="${k}">${l}<span class="nb-c">${n(c)}</span></button>`;
      }).join('')}</div>`;
  }

  /* الآيات */
  function versesPane() {
    const st = S();
    const bar = `<div class="nb-bar"><div class="chips" role="group" aria-label="طريقة العرض">
        <button class="chip" data-act="view" data-view="recent" aria-pressed="${ui.view === 'recent'}">الأحدث</button>
        <button class="chip" data-act="view" data-view="theme" aria-pressed="${ui.view === 'theme'}">حسب الموضوع</button>
      </div></div>`;
    if (!st.notebook.length) return bar + emptyState('لا توجد آيات محفوظة بعد. احفظ آية من القراءة أو من نتائج البحث.', 'افتح المصحف', 'go-reader');
    return bar + (ui.view === 'recent' ? recentList() : byTheme());
  }

  function recentList() {
    return `<ul class="list nb-list">${byDate(S().notebook).map((v) => {
      const ay = QB.ayah(v.s, v.a);
      const names = dotNames(v.themes);
      return `<li><div class="nb-row">
          <button class="nb-main" data-act="verse" data-s="${v.s}" data-a="${v.a}" aria-label="افتح ${esc(ref(v.s, v.a))} في المصحف">
            <span class="nb-ref"><b>${ref(v.s, v.a)}</b><span class="nb-dots">${dots(v.themes)}</span>${names ? `<span class="sr">المواضيع: ${esc(names)}</span>` : ''}</span>
            ${ay ? `<span class="nb-snip" lang="ar">${snip(ay.text, 7)}</span>` : ''}
            <span class="nb-meta">${QB.age(v.at)}${v.themes.length ? '' : '، بلا موضوع'}</span>
          </button>
          <div class="nb-acts">
            <button class="quiet nb-q-btn" data-act="themes" data-s="${v.s}" data-a="${v.a}" aria-label="مواضيع ${esc(ref(v.s, v.a))}">${QB.ico('tag', 'sm')}المواضيع</button>
            <button class="icon-btn nb-x" data-act="del-verse" data-id="${v.id}" aria-label="احذف ${esc(ref(v.s, v.a))} من الدفتر" title="حذف من الدفتر">${QB.ico('trash', 'sm')}</button>
          </div>
        </div></li>`;
    }).join('')}</ul>`;
  }

  const savedCounts = () => { const c = new Array(114).fill(0); S().notebook.forEach((v) => { c[v.s - 1] += 1; }); return c; };
  const surahsWord = (k) => (k === 1 ? 'سورة واحدة' : k === 2 ? 'سورتين' : k >= 3 && k <= 10 ? `${n(k)} سور` : `${n(k)} سورة`);

  function byTheme() {
    const st = S();
    const counts = savedCounts();
    const surahs = counts.filter(Boolean).length;
    return `<section class="nb-rib" aria-labelledby="nb-rib-t">
        <div class="block-title"><h3 class="label" id="nb-rib-t">أين تقع آياتك في المصحف</h3><span id="nb-rib-act">${ribbonAct()}</span></div>
        ${QB.ribbon(counts, { id: 'nb-rib', live: true, focus: ui.surah ?? undefined, label: `${ayat(st.notebook.length)} محفوظة في ${surahsWord(surahs)}` })}
        <div class="axis"><span>${QB.data.names[0]}</span><span class="readout" id="nb-read" aria-live="polite"></span><span>${QB.data.names[113]}</span></div>
      </section>
      <div id="nb-sections">${themeSections()}</div>`;
  }
  const ribbonAct = () => (ui.surah != null ? `<button class="link" data-act="surah-clear">كل السور ${QB.ico('x', 'sm')}</button>` : '<span class="label">المس عموداً لتصفية المواضيع بسورته</span>');

  function themeSections() {
    const st = S();
    const inSurah = (v) => ui.surah == null || v.s - 1 === ui.surah;
    const loose = st.notebook.filter((v) => !v.themes.length && inSurah(v));
    return `${ui.surah != null ? `<p class="label nb-filter">مواضيع آياتك في سورة ${QB.data.names[ui.surah]}</p>` : ''}
      ${st.themes.map((t) => themeSection(t, versesOf(t.id).filter(inSurah), versesOf(t.id).length)).join('')}
      ${loose.length || ui.surah == null ? `<section class="nb-sec" aria-labelledby="nb-sec-none">
        <div class="nb-sec-head"><h3 class="h3" id="nb-sec-none">بلا موضوع</h3><span class="label">${ayat(loose.length)}</span></div>
        ${loose.length ? `<ul class="list">${loose.map(mini).join('')}</ul>` : '<p class="empty">كل آياتك مظلّلة بموضوع.</p>'}
      </section>` : ''}`;
  }
  // Ribbon pick: repaint the sections only, so the ribbon keeps its focus and keyboard position.
  function pickSurah(i) {
    ui.surah = i;
    const box = el.querySelector('#nb-sections');
    if (!box) { rerender(); return; }
    box.innerHTML = themeSections();
    el.querySelector('#nb-rib-act').innerHTML = ribbonAct();
    el.querySelectorAll('#nb-rib .bar').forEach((b, k) => b.classList.toggle('dim', i != null && k !== i));
  }

  function themeSection(t, list, total) {
    if (ui.surah != null && !list.length) return '';
    return `<section class="nb-sec" data-sec="${t.id}" aria-labelledby="nb-sec-${t.id}">
        <div class="nb-sec-head">
          <span class="th-dot" style="--c:${QB.thColor(t.color)}"></span>
          <h3 class="h3" id="nb-sec-${t.id}">${esc(t.name)}</h3>
          <span class="label">${ayat(total)}</span>
          <button class="link" data-act="theme-boards" data-id="${t.id}">اللوحات</button>
          <button class="icon-btn nb-x" data-act="theme-edit" data-id="${t.id}" aria-label="عدّل الموضوع «${esc(t.name)}»" title="تعديل الموضوع">${QB.ico('edit', 'sm')}</button>
        </div>
        ${list.length ? `<ul class="list">${list.map(mini).join('')}</ul>` : '<p class="empty">لا آيات بهذا الموضوع بعد. اختر أداة «تظليل» في القراءة واضغط آية لتضمّها إليه.</p>'}
      </section>`;
  }

  function mini(v) {
    const ay = QB.ayah(v.s, v.a);
    const long = ay && QB.words(ay.text).length > 12;
    const open = ui.open.has(v.id);
    return `<li class="nb-mini">
        <button class="nb-mini-ref" data-act="verse" data-s="${v.s}" data-a="${v.a}">${ref(v.s, v.a)}</button>
        ${ay ? `<p class="nb-q" lang="ar" id="nb-q-${v.id}">${long && !open ? snip(ay.text, 12) : ay.text}</p>` : ''}
        ${long ? `<button class="link nb-more" data-act="more" data-id="${v.id}" aria-expanded="${open}" aria-controls="nb-q-${v.id}">${open ? 'أقلّ' : 'الآية كاملة'}</button>` : ''}
      </li>`;
  }

  /* اللوحات */
  function boardsPane() {
    const st = S();
    if (!st.themes.length) return emptyState('لا مواضيع بعد. ظلِّل آية بموضوع من القراءة، ثم أنشئ له لوحة تربط آياته.', 'افتح المصحف', 'go-reader');
    return st.themes.map((t) => {
      const boards = byDate(st.boards.filter((b) => b.themeId === t.id));
      const k = versesOf(t.id).length;
      return `<section class="nb-sec" data-sec="${t.id}" aria-labelledby="nb-bsec-${t.id}">
          <div class="nb-sec-head">
            <span class="th-dot" style="--c:${QB.thColor(t.color)}"></span>
            <h3 class="h3" id="nb-bsec-${t.id}">${esc(t.name)}</h3>
            <span class="label">اللوحات: ${n(boards.length)}</span>
          </div>
          ${boards.length ? `<ul class="list">${boards.map((b) => boardRow(b, k)).join('')}</ul>` : (ui.creating === t.id ? '' : '<p class="empty">لا لوحات لهذا الموضوع بعد. أنشئ لوحة لتربط آياته بملاحظاتك.</p>')}
          ${ui.creating === t.id ? `<form class="nb-form" data-form="create" data-id="${t.id}">
              <label class="sr" for="nb-new-${t.id}">اسم اللوحة</label>
              <input class="input" id="nb-new-${t.id}" value="${esc(`${t.name} ${n(boards.length + 1)}`)}" autocomplete="off">
              <button class="cta sm" type="submit">إنشاء</button>
              <button class="quiet" type="button" data-act="create-cancel">إلغاء</button>
            </form>`
          : `<button class="quiet nb-add" data-act="create" data-id="${t.id}">${QB.ico('plus', 'sm')}لوحة جديدة</button>`}
        </section>`;
    }).join('');
  }

  function boardRow(b, k) {
    if (ui.renaming === b.id) return `<li><form class="nb-form" data-form="rename" data-id="${b.id}">
        <label class="sr" for="nb-ren-${b.id}">اسم اللوحة</label>
        <input class="input" id="nb-ren-${b.id}" value="${esc(b.name)}" autocomplete="off">
        <button class="cta sm" type="submit">حفظ</button>
        <button class="quiet" type="button" data-act="rename-cancel">إلغاء</button>
      </form></li>`;
    if (ui.asking === b.id) return `<li><div class="nb-ask" role="group" aria-label="تأكيد حذف اللوحة">
        <span>حذف لوحة «${esc(b.name)}»؟ تبقى آيات الموضوع محفوظة.</span>
        <button class="ghost sm nb-danger" data-act="board-del-yes" data-id="${b.id}">حذف</button>
        <button class="quiet" data-act="board-del-no">إلغاء</button>
      </div></li>`;
    return `<li><div class="nb-row">
        <button class="nb-main" data-act="board" data-id="${b.id}">
          <span class="nb-ref"><span class="nb-glyph">${QB.ico('board', 'sm')}</span><b>${esc(b.name)}</b></span>
          <span class="nb-meta">${ayat(k)}، ${QB.age(b.at)}</span>
        </button>
        <div class="nb-acts">
          <button class="icon-btn nb-x" data-act="board-rename" data-id="${b.id}" aria-label="أعد تسمية «${esc(b.name)}»" title="إعادة التسمية">${QB.ico('edit', 'sm')}</button>
          <button class="icon-btn nb-x" data-act="board-del" data-id="${b.id}" aria-label="احذف «${esc(b.name)}»" title="حذف اللوحة">${QB.ico('trash', 'sm')}</button>
        </div>
      </div></li>`;
  }

  /* الأبحاث */
  function documentsPane() {
    const docs = byDate(S().documents);
    const bar = `<div class="nb-bar"><span class="label">أبحاثك المكتوبة من الدراسة واللوحات</span><button class="ghost sm" data-act="doc-new">${QB.ico('plus', 'sm')}بحث جديد</button></div>`;
    if (!docs.length) return bar + emptyState('لا أبحاث بعد. حوِّل جلسة من الدراسة، أو صدِّر لوحة موضوع، أو ابدأ بحثاً جديداً.');
    return bar + `<ul class="list nb-list">${docs.map((d) => {
      const [secs, refs] = docStats(d);
      const [cls, label] = STATUS[d.status] || STATUS.draft;
      const from = d.from === 'studio' ? '، من الدراسة' : d.from === 'board' ? '، من لوحة' : '';
      return `<li><div class="nb-row">
          <button class="nb-main" data-act="doc" data-id="${d.id}">
            <span class="nb-ref"><span class="nb-glyph">${QB.ico('doc', 'sm')}</span><b>${esc(d.title)}</b><span class="pill ${cls}">${label}</span></span>
            <span class="nb-meta">${n(secs)} قسم، ${n(refs)} آية، ${QB.age(d.at)}${from}</span>
          </button>
          <div class="nb-acts">
            <button class="icon-btn nb-x" data-act="doc-del" data-id="${d.id}" aria-label="احذف البحث «${esc(d.title)}»" title="حذف البحث">${QB.ico('trash', 'sm')}</button>
          </div>
        </div></li>`;
    }).join('')}</ul>`;
  }

  /* الجلسات */
  function sessionsPane() {
    const list = byDate(S().sessions.filter((s) => ui.sessFilter === 'all' || s.mode === ui.sessFilter));
    const bar = `<div class="nb-bar"><div class="chips" role="group" aria-label="تصنيف الجلسات">
        ${[['all', 'الكل'], ['strict', 'القرآن وحدَه'], ['tafsir', 'تفسيرية']].map(([k, l]) => `<button class="chip" data-act="sess-filter" data-f="${k}" aria-pressed="${ui.sessFilter === k}">${l}</button>`).join('')}
      </div><button class="link" data-act="go-study">جلسة جديدة ${QB.ico('plus', 'sm')}</button></div>`;
    if (!list.length) return bar + emptyState('لا توجد جلسات محفوظة في هذا التصنيف.');
    return bar + `<ul class="list nb-list">${list.map((s) => `<li><div class="nb-row">
        <button class="nb-main" data-act="session" data-id="${s.id}">
          <span class="nb-ref"><span class="nb-glyph">${QB.ico('study', 'sm')}</span><b>${esc(s.title)}</b></span>
          <span class="nb-meta"><span class="pill ${s.mode === 'tafsir' ? 'tafsir' : 'gold'}">${s.mode === 'tafsir' ? 'تفسيرية' : 'القرآن وحدَه'}</span>${n(msgCount(s))} رسالة، ${QB.age(s.at)}</span>
        </button>
        <div class="nb-acts">
          <button class="icon-btn nb-x" data-act="sess-del" data-id="${s.id}" aria-label="احذف الجلسة «${esc(s.title)}»" title="حذف الجلسة">${QB.ico('trash', 'sm')}</button>
        </div>
      </div></li>`).join('')}</ul>`;
  }

  /* الجذور */
  function rootsPane() {
    const roots = S().followedRoots;
    if (!roots.length) return emptyState('لا توجد جذور مُتابَعة بعد. تابِع جذراً من لوحة المطابقة.', 'افتح البحث', 'go-search');
    return `<ul class="list nb-list">${roots.map((r) => {
      const sp = QB.spread(r);
      return `<li><div class="nb-row nb-root">
          <button class="nb-main" data-act="root" data-root="${esc(r)}" aria-label="خريطة انتشار الجذر ${esc(r)}">
            <span class="nb-root-line"><b class="letters">${QB.letters(r)}</b>${sp ? QB.miniRibbon(sp.counts) : ''}</span>
            <span class="nb-meta">${sp ? `${n(sp.total)} موضعاً في ${n(sp.counts.filter(Boolean).length)} سورة` : 'لا تتوفّر خريطة انتشار هذا الجذر في النموذج.'}</span>
          </button>
          <button class="quiet nb-unf" data-act="unfollow" data-root="${esc(r)}">إلغاء المتابعة</button>
        </div></li>`;
    }).join('')}</ul>`;
  }

  const emptyState = (text, cta, act) => `<div class="empty-state nb-empty"><p class="lede">${text}</p>${cta ? `<button class="ghost sm" data-act="${act}">${cta}</button>` : ''}</div>`;

  function render() {
    if (!el) return;
    const keep = [el.scrollTop, QB.$('#main').scrollTop];
    // Keep keyboard focus on the same control across a re-render.
    const fa = document.activeElement, fd = fa && el.contains(fa) ? fa.dataset : null;
    const again = fd && fd.act ? `[data-act="${fd.act}"]` + ['id', 'view', 'f', 'tab', 'root'].map((k) => (fd[k] ? `[data-${k}="${CSS.escape(fd[k])}"]` : '')).join('') : null;
    const pane = { verses: versesPane, boards: boardsPane, documents: documentsPane, sessions: sessionsPane, roots: rootsPane }[ui.tab]();
    el.innerHTML = `<div class="nb">${head()}
        <div class="nb-pane" id="nb-pane" role="tabpanel" aria-labelledby="nb-tab-${ui.tab}">${pane}</div>
        ${ui.undo ? `<div class="nb-undo" role="status"><span>${ui.undo.msg}</span><button class="link" data-act="undo">تراجَع</button></div>` : ''}
      </div>`;
    el.scrollTop = keep[0]; QB.$('#main').scrollTop = keep[1];

    const rib = el.querySelector('#nb-rib');
    if (rib) {
      const counts = savedCounts();
      const total = S().notebook.length, surahs = counts.filter(Boolean).length;
      QB.wireRibbon(rib, el.querySelector('#nb-read'),
        (i) => (counts[i] ? `${QB.data.names[i]}: ${ayat(counts[i])} محفوظة` : `${QB.data.names[i]}: لم تحفظ منها شيئاً`),
        (i) => { const next = i != null && counts[i] ? i : (i == null ? null : ui.surah); if (next !== ui.surah) pickSurah(next); },
        () => (ui.surah != null ? `${QB.data.names[ui.surah]}: ${ayat(counts[ui.surah])} محفوظة` : `${ayat(total)} في ${surahsWord(surahs)}`));
    }
    if (ui.focus) {
      const sec = el.querySelector(`[data-sec="${ui.focus}"]`);
      ui.focus = null;
      // QB.go resets the panel scroll after show(); scroll on the next frame.
      if (sec) { sec.classList.add('nb-focus'); setTimeout(() => sec.scrollIntoView({ block: 'start', behavior: 'smooth' }), 40); setTimeout(() => sec.classList.remove('nb-focus'), 2600); }
    }
    const input = el.querySelector('.nb-form .input');
    if (input && focusKey === 'form') { input.focus(); input.select(); }
    else if (focusKey === 'undo') el.querySelector('[data-act="undo"]')?.focus();
    else if (focusKey === 'tab') el.querySelector('.nb-tabs [aria-selected="true"]')?.focus();
    else if (again) el.querySelector(again)?.focus();
    focusKey = null;
  }

  /* ---------- theme edit sheet ---------- */
  function editTheme(id) {
    const t = QB.theme(id);
    if (!t) return;
    let color = t.color;
    QB.sheet({ title: 'تعديل الموضوع', render: (b, close) => {
      b.innerHTML = `<div class="field nb-field"><label for="nb-th-name">اسم الموضوع</label>
          <input class="input" id="nb-th-name" value="${esc(t.name)}" autocomplete="off" aria-describedby="nb-th-err">
          <span class="nb-err" id="nb-th-err" role="alert"></span></div>
        <div class="field"><span id="nb-th-c">اللون</span>
          <div class="swatches" role="group" aria-labelledby="nb-th-c">${QB.swatchKeys.map(([k, l]) => `<button class="swatch" aria-label="${l}" aria-pressed="${k === color}" data-c="${k}" style="--c:${QB.thColor(k)}"></button>`).join('')}</div></div>
        <p class="label">${ayat(versesOf(id).length)} بهذا الموضوع، و${count(S().boards.filter((x) => x.themeId === id).length, 'لوحة', 'لوحتان', 'لوحات')}.</p>
        <div class="nb-sheet-acts">
          <button class="cta" data-save>حفظ</button>
          <button class="quiet danger" data-delete>${QB.ico('trash', 'sm')}حذف الموضوع</button>
        </div>`;
      const name = b.querySelector('#nb-th-name');
      b.querySelectorAll('[data-c]').forEach((x) => x.addEventListener('click', () => {
        color = x.dataset.c;
        b.querySelectorAll('[data-c]').forEach((y) => y.setAttribute('aria-pressed', y === x));
      }));
      const save = () => {
        const v = name.value.trim();
        if (!v) { b.querySelector('#nb-th-err').textContent = 'اكتب اسماً للموضوع ثم احفظ.'; name.focus(); return; }
        t.name = v; t.color = color; close(); QB.emit('notebook'); QB.toast('حُفظ الموضوع.');
      };
      b.querySelector('[data-save]').addEventListener('click', save);
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      b.querySelector('[data-delete]').addEventListener('click', () => QB.confirm({
        title: 'حذف الموضوع؟', body: 'تبقى آياته محفوظة.', confirm: 'حذف الموضوع', danger: true,
        onConfirm: () => {
          const st = S();
          st.themes = st.themes.filter((x) => x.id !== id);
          st.notebook.forEach((v) => { v.themes = v.themes.filter((x) => x !== id); });
          const lost = st.boards.filter((x) => x.themeId === id).length;
          st.boards = st.boards.filter((x) => x.themeId !== id);
          QB.emit('notebook');
          QB.toast(lost ? `حُذف «${t.name}» ولوحاته، وبقيت آياته في الدفتر.` : `حُذف «${t.name}»، وبقيت آياته في الدفتر.`);
        },
      }));
    } });
  }

  /* ---------- actions ---------- */
  function act(t, e) {
    const st = S();
    const d = t.dataset, kb = e && e.detail === 0;
    switch (d.act) {
      case 'tab': ui.tab = d.tab; ui.creating = ui.renaming = ui.asking = null; focusKey = 'tab'; rerender(); break;
      case 'view': ui.view = d.view; rerender(); break;
      case 'verse': QB.openVerse(+d.s, +d.a); break;
      case 'themes': QB.saveAyah(+d.s, +d.a); break;
      case 'del-verse': {
        const i = st.notebook.findIndex((v) => v.id === d.id);
        if (i < 0) return;
        const [v] = st.notebook.splice(i, 1);
        offerUndo(`حُذفت ${ref(v.s, v.a)} من الدفتر.`, () => { st.notebook.splice(Math.min(i, st.notebook.length), 0, v); QB.emit('notebook'); }, kb);
        QB.emit('notebook');
        break;
      }
      case 'undo': if (ui.undo) { const fn = ui.undo.fn; ui.undo = null; clearTimeout(undoT); fn(); rerender(); QB.toast('أُعيد كما كان.'); } break;
      case 'more': ui.open.has(d.id) ? ui.open.delete(d.id) : ui.open.add(d.id); rerender(); break;
      case 'surah-clear': pickSurah(null); el.querySelector('#nb-rib')?.focus(); el.querySelector('#nb-read').textContent = `${ayat(S().notebook.length)} في ${surahsWord(savedCounts().filter(Boolean).length)}`; break;
      case 'theme-edit': editTheme(d.id); break;
      case 'theme-boards': {
        const bs = st.boards.filter((b) => b.themeId === d.id);
        if (bs.length === 1) { QB.go('board', { id: bs[0].id }); return; }
        ui.tab = 'boards'; ui.focus = d.id; ui.creating = bs.length ? null : d.id; if (!bs.length) focusKey = 'form';
        rerender();
        break;
      }
      case 'board': QB.go('board', { id: d.id }); break;
      case 'board-rename': ui.renaming = d.id; ui.asking = ui.creating = null; focusKey = 'form'; rerender(); break;
      case 'rename-cancel': ui.renaming = null; rerender(); break;
      case 'board-del': ui.asking = d.id; ui.renaming = ui.creating = null; rerender(); break;
      case 'board-del-no': ui.asking = null; rerender(); break;
      case 'board-del-yes': {
        const b = st.boards.find((x) => x.id === d.id);
        st.boards = st.boards.filter((x) => x.id !== d.id);
        ui.asking = null; QB.emit('boards'); rerender();
        if (b) QB.toast(`حُذفت لوحة «${b.name}».`);
        break;
      }
      case 'create': ui.creating = d.id; ui.renaming = ui.asking = null; focusKey = 'form'; rerender(); break;
      case 'create-cancel': ui.creating = null; rerender(); break;
      case 'doc': QB.go('document', { id: d.id }); break;
      case 'doc-new': {
        const doc = { id: QB.uid('d'), title: 'بحث جديد', from: 'blank', at: QB.today.toISOString(), status: 'draft' };
        st.documents.unshift(doc); QB.emit('documents');
        QB.go('document', { id: doc.id });
        break;
      }
      case 'doc-del': {
        const doc = st.documents.find((x) => x.id === d.id);
        if (!doc) return;
        QB.confirm({ title: 'حذف البحث نهائياً؟', body: `يُحذف «${esc(doc.title)}» من دفترك، ولا يمكن التراجع.${doc.status === 'published' ? ' يبقى منشوره في المجتمع حتى تسحبه.' : ''}`, confirm: 'حذف البحث', danger: true,
          onConfirm: () => { st.documents = st.documents.filter((x) => x !== doc); QB.emit('documents'); rerender(); QB.toast('حُذف البحث.'); } });
        break;
      }
      case 'sess-filter': ui.sessFilter = d.f; rerender(); break;
      case 'session': QB.go('study', { session: d.id }); break;
      case 'go-study': QB.go('study', { new: true }); break;
      case 'sess-del': {
        const i = st.sessions.findIndex((x) => x.id === d.id);
        if (i < 0) return;
        const [s] = st.sessions.splice(i, 1);
        offerUndo('حُذفت الجلسة.', () => { st.sessions.splice(Math.min(i, st.sessions.length), 0, s); QB.emit('sessions'); }, kb);
        QB.emit('sessions'); rerender();
        break;
      }
      case 'root': QB.go('heatmap', { root: d.root }); break;
      case 'unfollow': {
        const i = st.followedRoots.indexOf(d.root);
        if (i < 0) return;
        st.followedRoots.splice(i, 1);
        offerUndo(`ألغيت متابعة الجذر ${QB.letters(d.root)}.`, () => { st.followedRoots.splice(Math.min(i, st.followedRoots.length), 0, d.root); QB.emit('roots'); }, kb);
        QB.emit('roots'); rerender();
        break;
      }
      case 'go-reader': QB.go('reader'); break;
      case 'go-search': QB.go('search'); break;
      default:
    }
  }

  function submit(form) {
    const st = S();
    const input = form.querySelector('.input');
    const name = input.value.trim();
    if (!name) { input.focus(); QB.toast('اكتب اسماً للوحة.'); return; }
    if (form.dataset.form === 'create') {
      const b = { id: QB.uid('b'), themeId: form.dataset.id, name, at: QB.today.toISOString() };
      st.boards.push(b); ui.creating = null; QB.emit('boards'); rerender();
      QB.toast(`أُنشئت لوحة «${name}». افتحها لتربط آيات الموضوع.`);
    } else {
      const b = st.boards.find((x) => x.id === form.dataset.id);
      if (b) b.name = name;
      ui.renaming = null; QB.emit('boards'); rerender();
    }
  }

  QB.on('notebook', () => { if (QB.current() === 'notebook') rerender(); });
  ['boards', 'documents', 'sessions', 'roots'].forEach((ev) => QB.on(ev, () => { if (QB.current() === 'notebook') rerender(); }));

  QB.screen('notebook', {
    room: 'panel', panelWidth: 560, world: 'research',
    title: () => ['الدفتر', 'آياتك ومواضيعك ولوحاتك وأبحاثك'],
    mount(panel) {
      el = panel;
      panel.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (t && panel.contains(t)) act(t, e); });
      panel.addEventListener('submit', (e) => { const f = e.target.closest('.nb-form'); if (f) { e.preventDefault(); submit(f); } });
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && e.target.closest('.nb-form, .nb-ask')) { e.stopPropagation(); ui.creating = ui.renaming = ui.asking = null; rerender(); return; }
        const tab = e.target.closest('.nb-tabs [role="tab"]');
        if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          const keys = TABS.map(([k]) => k), i = keys.indexOf(ui.tab);
          ui.tab = keys[(i + (e.key === 'ArrowLeft' ? 1 : -1) + keys.length) % keys.length];   // RTL: left = next
          focusKey = 'tab'; render();
        }
      });
    },
    show(panel, params = {}) {
      el = panel;
      if (params.tab && TABS.some(([k]) => k === params.tab)) ui.tab = params.tab;
      if (params.focus) { ui.focus = params.focus; if (!params.tab) ui.tab = 'boards'; }
      ui.creating = ui.renaming = ui.asking = null;
      render();
    },
  });
})();
