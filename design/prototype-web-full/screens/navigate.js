/* Navigate (prefix nv- for the shared «انتقل» component, ix- for الفهرس, sv- for المحفوظة).
   QB.navigator(el, { tab, onPick, ribbon }) renders the «انتقل» component into el. The Reader puts it
   in a side sheet; the Index page embeds it. onPick receives a target:
     { kind: 'surah'|'ayah'|'juz'|'hizb'|'page'|'saved', s, a }   when that verse is on a loaded page
     { kind, page }                                                 otherwise, when the page is known
     { kind, s, a }                                                 otherwise (e.g. ٢:٢٥٥, a hizb mid-page)
   so QB.mushaf.goTo(target) does the right thing with it. */
(() => {
  const { n, esc } = QB;

  // First verse of each hizb (1–60), Ḥafṣ, Madani numbering.
  // Copied from apps/web/lib/quran-divisions.generated.ts (HIZB_STARTS).
  const HIZB_STARTS = [
    [1, 1], [2, 75], [2, 142], [2, 203], [2, 253], [3, 15], [3, 93], [3, 171], [4, 24], [4, 88],
    [4, 148], [5, 27], [5, 82], [6, 36], [6, 111], [7, 1], [7, 88], [7, 171], [8, 41], [9, 34],
    [9, 93], [10, 26], [11, 6], [11, 84], [12, 53], [13, 19], [15, 1], [16, 51], [17, 1], [17, 99],
    [18, 75], [20, 1], [21, 1], [22, 1], [23, 1], [24, 21], [25, 21], [26, 111], [27, 56], [28, 51],
    [29, 46], [31, 22], [33, 31], [34, 24], [36, 28], [37, 145], [39, 32], [40, 41], [41, 47], [43, 24],
    [46, 1], [48, 18], [51, 31], [55, 1], [58, 1], [62, 1], [67, 1], [72, 1], [78, 1], [87, 1],
  ];

  /* ---------------- Helpers ---------------- */
  const PAGES = () => QB.data.stats.pages || 604;
  const cmp = (s1, a1, s2, a2) => (s1 - s2) || (a1 - a2);
  const typeLabel = (t) => (t === 'medinan' ? 'مدنيّة' : 'مكّيّة');
  // Arabic counted nouns: ١ آية، ٢ آيتان، ٣–١٠ آيات، ١١+ آية.
  const count = (k, one, two, few) => (k === 1 ? `${one} واحدة` : k === 2 ? two : k <= 10 ? `${n(k)} ${few}` : `${n(k)} ${one}`);
  const ayahsTxt = (k) => (k === 1 ? 'آية واحدة' : k === 2 ? 'آيتان' : k <= 10 ? `${n(k)} آيات` : `${n(k)} آية`);
  const pagesTxt = (k) => count(k, 'صفحة', 'صفحتان', 'صفحات');
  const toLatin = (s) => String(s || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  const norm = (s) => QB.strip(s).replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
  const plainName = (s) => QB.surah(s).name;
  // English transliterations without macrons, hyphens or apostrophes: "Yā-Sīn" → "yasin".
  const latinKey = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/^(surah|sura)\s+/, '').replace(/[^a-z]/g, '');

  const surahAtPage = (p) => { let hit = QB.data.index[0]; for (const s of QB.data.index) { if (s.page <= p) hit = s; else break; } return hit; };
  const juzAtPage = (p) => { let hit = QB.data.juz[0]; for (const j of QB.data.juz) { if (j.page <= p) hit = j; else break; } return hit; };
  const juzOf = (s, a) => { let k = 0; QB.data.juz.forEach((j, i) => { if (cmp(j.s, j.a, s, a) <= 0) k = i; }); return k; };
  const hizbOf = (s, a) => { let k = 0; HIZB_STARTS.forEach(([hs, ha], i) => { if (cmp(hs, ha, s, a) <= 0) k = i; }); return k; };
  // A hizb's page is known only when it starts exactly where a juz starts, or at the first verse of a surah.
  const hizbPage = (i) => {
    const [s, a] = HIZB_STARTS[i];
    const j = QB.data.juz.find((x) => x.s === s && x.a === a);
    if (j) return j.page;
    if (a === 1) return QB.surah(s).page || null;
    return null;
  };
  const loaded = (p) => QB.pageNumbers.includes(p);
  // Where the reader is now: the Mushaf beside the panel when present, else the last read place.
  const here = () => {
    let c = null;
    try { c = QB.mushaf && QB.mushaf.current ? QB.mushaf.current() : null; } catch (e) { c = null; }
    const l = QB.state.lastRead || {};
    const page = (c && c.page) || l.page || 1;
    let s = (c && c.s) || l.s, a = (c && c.a) || l.a;
    if (!s) { s = surahAtPage(page).id; a = 1; }
    return { page, s, a: a || 1 };
  };
  // The page's opening words, running across short verses (e.g. «الٓمٓ ذَٰلِكَ ٱلۡكِتَٰبُ …»).
  const firstWords = (p, k = 5) => { const pg = QB.page(p); if (!pg || !pg.ayahs.length) return ''; return pg.ayahs.slice(0, 4).flatMap((x) => QB.words(x.text)).slice(0, k).join(' '); };
  const pageSurah = (p) => { const pg = QB.page(p); return pg && pg.ayahs.length ? QB.surah(pg.ayahs[0].s) : surahAtPage(p); };

  // The position of a page in the whole Mushaf: a hairline with a gold point (page 1 on the right).
  const pos = (p) => `<span class="nv-pos" aria-hidden="true" style="--p:${((p - 1) / Math.max(1, PAGES() - 1)).toFixed(4)}"><i></i></span>`;

  /* ---------------- Undo toast (shared by the component and the Saved page) ---------------- */
  let undoT = null;
  const undoToast = (msg, onUndo) => {
    let el = document.getElementById('nv-undo');
    if (!el) { el = document.createElement('div'); el.id = 'nv-undo'; el.className = 'nv-undo'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.innerHTML = `<span>${msg}</span><button class="nv-undo-btn" type="button">تراجَع</button><span class="nv-undo-ring" aria-hidden="true"></span>`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(undoT);
    undoT = setTimeout(() => el.classList.remove('on'), 6000);
    el.querySelector('button').addEventListener('click', () => { clearTimeout(undoT); el.classList.remove('on'); onUndo(); });
  };
  const removeSaved = (page) => {
    const list = QB.state.savedPages;
    const idx = list.findIndex((x) => x.page === page);
    if (idx < 0) return;
    const [item] = list.splice(idx, 1);
    QB.set('savedPages', list);
    undoToast(`أُزيلت صفحة ${n(page)} من المحفوظات.`, () => {
      const cur = QB.state.savedPages;
      if (!cur.some((x) => x.page === page)) cur.splice(Math.min(idx, cur.length), 0, item);
      QB.set('savedPages', cur);
    });
  };

  /* ---------------- Swipe to delete (pointer drag on a row) ---------------- */
  const wireSwipe = (root, onDelete) => {
    let st = null;
    root.addEventListener('pointerdown', (e) => {
      const fg = e.target.closest('.nv-swipe-fg');
      if (!fg || e.button > 0 || e.target.closest('[data-del]')) return;
      st = { fg, x: e.clientX, y: e.clientY, dx: 0, moved: false, id: e.pointerId };
    });
    root.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.moved) {
        if (Math.abs(dx) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { st = null; return; }
        st.moved = true;
        try { st.fg.setPointerCapture(e.pointerId); } catch (_) {}
        st.fg.closest('.nv-swipe').classList.add('dragging');
      }
      st.dx = Math.max(-150, Math.min(150, dx));
      st.fg.style.transform = `translateX(${st.dx}px)`;
      st.fg.closest('.nv-swipe').classList.toggle('armed', Math.abs(st.dx) > 90);
    });
    const end = () => {
      if (!st) return;
      const s = st; st = null;
      if (!s.moved) return;
      const w = s.fg.closest('.nv-swipe');
      s.fg._swipedAt = Date.now();
      if (Math.abs(s.dx) > 90) {
        s.fg.style.transition = 'transform 180ms var(--ease)';
        s.fg.style.transform = `translateX(${s.dx > 0 ? 110 : -110}%)`;
        setTimeout(() => onDelete(+w.dataset.page), 170);
      } else {
        w.classList.remove('dragging', 'armed');
        s.fg.style.transition = 'transform 200ms var(--ease)';
        s.fg.style.transform = '';
        setTimeout(() => { s.fg.style.transition = ''; }, 220);
      }
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  };
  const justSwiped = (el) => el && el._swipedAt && Date.now() - el._swipedAt < 400;

  /* ---------------- Reference parsing ---------------- */
  const findSurahs = (q) => {
    const isLatin = /[a-z]/i.test(q);
    const k = isLatin ? latinKey(q) : norm(q).replace(/^سوره\s+/, '');
    if (!k) return [];
    const starts = [], has = [];
    QB.data.index.forEach((s) => {
      const nm = norm(s.name), bare = nm.replace(/^ال/, ''), en = latinKey(s.en);
      if (nm.startsWith(k) || bare.startsWith(k) || en.startsWith(k)) starts.push(s);
      else if (nm.includes(k) || en.includes(k)) has.push(s);
    });
    return [...starts, ...has];
  };
  const pageHint = (p) => {
    const sur = surahAtPage(p), j = juzAtPage(p);
    return `${sur.name}، الجزء ${n(j.n)}${loaded(p) ? '' : '، غير محمّلة في هذا النموذج'}`;
  };
  const surahTarget = (s) => ({ kind: 'surah', s: s.id, a: 1, page: s.page });
  const ayahTarget = (sid, a) => { const s = QB.surah(sid); const p = QB.pageOf(sid, a) || (a === 1 ? s.page : undefined); return { kind: 'ayah', s: sid, a, page: p }; };
  const juzTarget = (i) => { const j = QB.data.juz[i]; return { kind: 'juz', s: j.s, a: j.a, page: j.page }; };
  const hizbTarget = (i) => { const [s, a] = HIZB_STARTS[i]; const p = hizbPage(i); const t = { kind: 'hizb', s, a }; if (p) t.page = p; return t; };
  const pageTarget = (p) => ({ kind: 'page', page: p });

  // Returns { cmds: [{label, hint, target}], surahs: [index entries], error }
  const parse = (raw) => {
    const q = toLatin(raw).trim().replace(/\s+/g, ' ').replace(/^سورة\s+/, '');
    const out = { cmds: [], surahs: [], error: '' };
    if (!q) return out;
    const total = PAGES();
    let m;
    if ((m = q.match(/^(\d{1,3})\s*[:：/.\-]\s*(\d{1,3})$/))) {
      const s = +m[1], a = +m[2];
      if (s < 1 || s > 114) { out.error = `لا توجد سورة برقم ${n(s)}؛ السور ${n(114)}.`; return out; }
      const sur = QB.surah(s);
      if (a < 1 || a > sur.ayahs) { out.error = `سورة ${sur.name} ${ayahsTxt(sur.ayahs)}؛ اختر آية بين ${n(1)} و${n(sur.ayahs)}.`; return out; }
      const t = ayahTarget(s, a);
      out.cmds.push({ label: `انتقل إلى سورة ${sur.name}، الآية ${n(a)}`, hint: t.page ? `صفحة ${n(t.page)}` : 'خارج الصفحات المحمّلة في هذا النموذج', target: t });
      return out;
    }
    if ((m = q.match(/^(?:صفحة|صفحه|الصفحة|ص|page|p)\s*(\d{1,4})$/i))) {
      const p = +m[1];
      if (p < 1 || p > total) { out.error = `المصحف ${pagesTxt(total)}؛ اكتب رقماً بين ${n(1)} و${n(total)}.`; return out; }
      out.cmds.push({ label: `انتقل إلى صفحة ${n(p)}`, hint: pageHint(p), target: pageTarget(p) });
      return out;
    }
    if ((m = q.match(/^(?:جزء|الجزء|جز|juz|j)\s*(\d{1,3})$/i))) {
      const k = +m[1];
      if (k < 1 || k > 30) { out.error = `الأجزاء ${n(30)}؛ اكتب رقماً بين ${n(1)} و${n(30)}.`; return out; }
      const t = juzTarget(k - 1);
      out.cmds.push({ label: `انتقل إلى الجزء ${n(k)}`, hint: `من ${plainName(t.s)} ${n(t.a)}، صفحة ${n(t.page)}`, target: t });
      return out;
    }
    if ((m = q.match(/^(?:حزب|الحزب|hizb|h)\s*(\d{1,3})$/i))) {
      const k = +m[1];
      if (k < 1 || k > 60) { out.error = `الأحزاب ${n(60)}؛ اكتب رقماً بين ${n(1)} و${n(60)}.`; return out; }
      const t = hizbTarget(k - 1);
      out.cmds.push({ label: `انتقل إلى الحزب ${n(k)}`, hint: `من ${plainName(t.s)} ${n(t.a)}${t.page ? `، صفحة ${n(t.page)}` : ''}`, target: t });
      return out;
    }
    if ((m = q.match(/^(\d{1,4})$/))) {
      const k = +m[1];
      if (k >= 1 && k <= 114) { const s = QB.surah(k); out.cmds.push({ label: `انتقل إلى سورة ${s.name}`, hint: `السورة ${n(k)}، صفحة ${n(s.page)}`, target: surahTarget(s) }); }
      if (k >= 1 && k <= total) out.cmds.push({ label: `انتقل إلى صفحة ${n(k)}`, hint: pageHint(k), target: pageTarget(k) });
      if (!out.cmds.length) out.error = `لا سورة ولا صفحة بهذا الرقم؛ المصحف ${pagesTxt(total)}.`;
      return out;
    }
    // "البقرة 255" or "البقرة:255"
    if ((m = q.match(/^(.+?)\s*[:\s]\s*(\d{1,3})$/))) {
      const hits = findSurahs(m[1]);
      if (hits.length) {
        const s = hits[0], a = +m[2];
        if (a >= 1 && a <= s.ayahs) {
          const t = ayahTarget(s.id, a);
          out.cmds.push({ label: `انتقل إلى سورة ${s.name}، الآية ${n(a)}`, hint: t.page ? `صفحة ${n(t.page)}` : 'خارج الصفحات المحمّلة في هذا النموذج', target: t });
        } else out.error = `سورة ${s.name} ${ayahsTxt(s.ayahs)}.`;
        out.surahs = hits;
        return out;
      }
    }
    out.surahs = findSurahs(q);
    if (out.surahs.length) out.cmds.push({ label: `انتقل إلى سورة ${out.surahs[0].name}`, hint: `السورة ${n(out.surahs[0].id)}، صفحة ${n(out.surahs[0].page)}`, target: surahTarget(out.surahs[0]) });
    return out;
  };

  /* ---------------- Templates ---------------- */
  const TABS = [['saved', 'المحفوظة'], ['surahs', 'السور'], ['juz', 'الأجزاء'], ['hizb', 'الأحزاب'], ['page', 'صفحة']];
  const surahRow = (s, h) => `<li data-s="${s.id}" data-type="${s.type}"><button class="nv-sr${h.s === s.id ? ' here' : ''}" data-pick="surah" data-s="${s.id}" ${h.s === s.id ? 'aria-current="location"' : ''}>
      <span class="nv-num">${n(s.id)}</span>
      <span class="nv-name">${s.name}<small>${typeLabel(s.type)}، ${ayahsTxt(s.ayahs)}</small></span>
      <span class="nv-pg">صفحة ${n(s.page)}</span>
    </button></li>`;
  const savedRow = (b, h) => {
    const sur = pageSurah(b.page);
    return `<li class="nv-swipe" data-page="${b.page}">
      <div class="nv-swipe-bg" aria-hidden="true"><span>${QB.ico('trash', 'sm')}إزالة</span><span>${QB.ico('trash', 'sm')}إزالة</span></div>
      <div class="nv-swipe-fg">
        <button class="nv-saved${h.page === b.page ? ' here' : ''}" data-pick="saved" data-page="${b.page}" ${h.page === b.page ? 'aria-current="location"' : ''}>
          ${pos(b.page)}
          <span class="nv-name">${sur.name}<small>صفحة ${n(b.page)}، ${QB.age(b.at)}${h.page === b.page ? '، أنت هنا' : ''}</small></span>
        </button>
        <button class="icon-btn nv-del" data-del="${b.page}" aria-label="إزالة صفحة ${n(b.page)} من المحفوظات" title="إزالة من المحفوظات">${QB.ico('x', 'sm')}</button>
      </div></li>`;
  };
  const savedPanel = (h) => {
    const list = [...QB.state.savedPages].sort((x, y) => (x.at < y.at ? 1 : -1));
    if (!list.length) return `<p class="nv-empty">احفظ صفحة من القراءة (علامة الحفظ في شريط القارئ) لتجدها هنا.</p>`;
    return `<ul class="list nv-list nv-saved-list">${list.map((b) => savedRow(b, h)).join('')}</ul>
      <p class="label nv-hint">اسحب السطر جانباً لإزالته، أو استعمل زر الإزالة.</p>`;
  };
  const ribbonBlock = (pfx, h, filter) => {
    const counts = QB.data.index.map((s) => s.ayahs);
    const mec = QB.data.index.filter((s) => s.type === 'meccan').length;
    const med = QB.data.index.length - mec;
    return `<div class="ix-ribbox">
      <div class="ix-filter" role="group" aria-label="نوع السورة">
        <button class="chip" data-filter="all" aria-pressed="${filter === 'all'}">الكل <span class="ix-c">${n(114)}</span></button>
        <button class="chip" data-filter="meccan" aria-pressed="${filter === 'meccan'}">مكّيّة <span class="ix-c">${n(mec)}</span></button>
        <button class="chip" data-filter="medinan" aria-pressed="${filter === 'medinan'}">مدنيّة <span class="ix-c">${n(med)}</span></button>
      </div>
      ${QB.ribbon(counts, { here: h.s - 1, live: true, id: `${pfx}-rib`, label: 'طول السور: عدد آيات كل سورة من الفاتحة إلى الناس' })}
      <div class="ix-types" aria-hidden="true">${QB.data.index.map((s) => `<i class="${s.type === 'medinan' ? 'med' : ''}"></i>`).join('')}</div>
      <div class="axis"><span>${QB.data.names[0]}</span><span class="readout" id="${pfx}-read"></span><span>${QB.data.names[113]}</span></div>
      <div class="ix-legend label"><span><i class="ix-k med"></i>مدنيّة</span><span><i class="ix-k"></i>مكّيّة</span><span>طول العمود عدد الآيات</span></div>
    </div>`;
  };

  /* ---------------- The component ---------------- */
  const live = new Set();
  QB.on('state', ({ key }) => { if (key === 'savedPages') live.forEach((x) => (x.el.isConnected ? x.refreshSaved() : live.delete(x))); });
  const refreshHereAll = () => live.forEach((x) => (x.el.isConnected ? x.markHere() : live.delete(x)));
  ['mushaf', 'page', 'route'].forEach((ev) => QB.on(ev, () => setTimeout(refreshHereAll, 0)));
  let seq = 0;

  QB.navigator = (el, opts = {}) => {
    const pfx = `nv${++seq}`;
    // Targets reach the consumer as {s, a} when that verse is on a loaded page (so the Mushaf can light it),
    // otherwise as {page} when the page is known, otherwise as {s, a}. `kind` is informative.
    const shape = (t) => {
      if (t.s && QB.pageOf(t.s, t.a || 1)) return { kind: t.kind, s: t.s, a: t.a || 1 };
      if (t.page) return { kind: t.kind, page: t.page };
      return { kind: t.kind, s: t.s, a: t.a || 1 };
    };
    const onPick = (t) => (opts.onPick || (() => {}))(shape(t));
    let tab = TABS.some(([k]) => k === opts.tab) ? opts.tab : 'surahs';
    let filter = 'all';
    const h = here();
    const total = PAGES();

    el.innerHTML = `<div class="nv" data-nv="${pfx}">
      <form class="nv-field" data-form>
        ${QB.ico('search')}
        <label for="${pfx}-q" class="sr">انتقل إلى سورة أو آية أو صفحة</label>
        <input id="${pfx}-q" class="nv-input" autocomplete="off" enterkeyhint="go" placeholder="اسم السورة أو رقمها · ${n('2:255')} · صفحة ${n(50)}" aria-describedby="${pfx}-help">
        <button type="button" class="nv-clear" data-clear aria-label="امسح الحقل" hidden>${QB.ico('x', 'sm')}</button>
      </form>
      <span class="sr" id="${pfx}-help">اكتب اسم سورة، أو رقم سورة، أو سورة وآية مثل ٢:٢٥٥، أو صفحة ٥٠، أو جزء ٣، أو حزب ٥، ثم اضغط Enter.</span>
      <div class="nv-results" data-results hidden aria-live="polite"></div>
      <div class="nv-body" data-body>
        <div class="tabs nv-tabs" role="tablist" aria-label="طرق الانتقال">${TABS.map(([k, l]) => `<button role="tab" id="${pfx}-t-${k}" aria-controls="${pfx}-p-${k}" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}" data-tab="${k}">${l}${k === 'saved' && QB.state.savedPages.length ? ` <span class="nv-tc">${n(QB.state.savedPages.length)}</span>` : ''}</button>`).join('')}</div>
        <div role="tabpanel" id="${pfx}-p-saved" aria-labelledby="${pfx}-t-saved" data-panel="saved" ${tab === 'saved' ? '' : 'hidden'}>${savedPanel(h)}</div>
        <div role="tabpanel" id="${pfx}-p-surahs" aria-labelledby="${pfx}-t-surahs" data-panel="surahs" ${tab === 'surahs' ? '' : 'hidden'}>
          ${opts.ribbon ? ribbonBlock(pfx, h, filter) : ''}
          <ul class="list nv-list" data-surahs>${QB.data.index.map((s) => surahRow(s, h)).join('')}</ul>
        </div>
        <div role="tabpanel" id="${pfx}-p-juz" aria-labelledby="${pfx}-t-juz" data-panel="juz" ${tab === 'juz' ? '' : 'hidden'}>
          <div class="nv-grid nv-juz">${QB.data.juz.map((j, i) => `<button class="nv-cell" data-pick="juz" data-i="${i}" aria-label="الجزء ${n(j.n)}، من ${plainName(j.s)} ${n(j.a)}، صفحة ${n(j.page)}"><b>${n(j.n)}</b><span>${plainName(j.s)} ${n(j.a)}</span><small>صفحة ${n(j.page)}</small></button>`).join('')}</div>
        </div>
        <div role="tabpanel" id="${pfx}-p-hizb" aria-labelledby="${pfx}-t-hizb" data-panel="hizb" ${tab === 'hizb' ? '' : 'hidden'}>
          <div class="nv-grid nv-hizb">${HIZB_STARTS.map(([s, a], i) => { const p = hizbPage(i); return `<button class="nv-cell" data-pick="hizb" data-i="${i}" aria-label="الحزب ${n(i + 1)}، من ${plainName(s)} ${n(a)}${p ? `، صفحة ${n(p)}` : ''}"><b>${n(i + 1)}</b><span>${plainName(s)} ${n(a)}</span>${p ? `<small>صفحة ${n(p)}</small>` : ''}</button>`; }).join('')}</div>
          <p class="label nv-note">كل جزء حزبان. تظهر صفحة البداية حيث يبدأ الحزب بأول جزء أو أول سورة.</p>
        </div>
        <div role="tabpanel" id="${pfx}-p-page" aria-labelledby="${pfx}-t-page" data-panel="page" ${tab === 'page' ? '' : 'hidden'}>
          <form class="nv-pageform" data-pageform novalidate>
            <div class="field"><label for="${pfx}-page"><span class="nv-flabel">رقم الصفحة (${n(1)}–${n(total)})</span></label>
              <div class="nv-pagerow"><input id="${pfx}-page" class="input nv-pagein" inputmode="numeric" autocomplete="off" value="${n(h.page)}" aria-describedby="${pfx}-pagehint"><button class="cta sm" type="submit">انتقال</button></div>
            </div>
            <p class="label nv-pagehint" id="${pfx}-pagehint" data-pagehint>${pageHint(h.page)}</p>
          </form>
          <div class="nv-loaded"><span class="label">في هذا النموذج حُمّلت صفحات ${n(1)}، ${n(2)}، ${n(499)}–${n(501)} فقط:</span>
            <div class="chips">${QB.pageNumbers.map((p) => `<button class="chip" data-pick="page" data-page="${p}" ${p === h.page ? 'aria-pressed="true"' : ''}>صفحة ${n(p)}</button>`).join('')}</div></div>
        </div>
      </div>
    </div>`;

    const root = el.querySelector('.nv');
    const input = root.querySelector(`#${pfx}-q`);
    const results = root.querySelector('[data-results]');
    const body = root.querySelector('[data-body]');
    let lastParse = null;

    const setTab = (k, focus) => {
      tab = k;
      root.querySelectorAll('[role=tab]').forEach((b) => { const on = b.dataset.tab === k; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
      root.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== k));
      api.markHere();
      if (opts.onTab) opts.onTab(k);
    };

    const renderResults = () => {
      const q = input.value;
      root.querySelector('[data-clear]').hidden = !q;
      if (!q.trim()) { results.hidden = true; body.hidden = false; lastParse = null; return; }
      const r = (lastParse = parse(q));
      const hh = here();
      results.hidden = false; body.hidden = true;
      results.innerHTML = `
        ${r.cmds.map((c, i) => `<button class="nv-cmd${i === 0 ? ' first' : ''}" data-cmd="${i}">${QB.ico('chevL', 'sm')}<span>${esc(c.label)}<small>${esc(c.hint)}</small></span>${i === 0 ? '<kbd>Enter</kbd>' : ''}</button>`).join('')}
        ${r.error ? `<p class="nv-err" role="alert">${esc(r.error)}</p>` : ''}
        ${r.surahs.length > (r.cmds.length ? 1 : 0) || (r.surahs.length && r.cmds[0]?.target.kind === 'ayah') ? `<ul class="list nv-list">${r.surahs.slice(0, 30).map((s) => surahRow(s, hh)).join('')}</ul>` : ''}
        ${!r.cmds.length && !r.error && !r.surahs.length ? '<p class="nv-empty">لا توجد سورة بهذا الاسم.</p>' : ''}`;
    };

    const pickFromEl = (t) => {
      const k = t.dataset.pick;
      if (k === 'surah') return surahTarget(QB.surah(+t.dataset.s));
      if (k === 'juz') return juzTarget(+t.dataset.i);
      if (k === 'hizb') return hizbTarget(+t.dataset.i);
      if (k === 'page') return pageTarget(+t.dataset.page);
      if (k === 'saved') return { kind: 'saved', page: +t.dataset.page };
      return null;
    };

    root.addEventListener('click', (e) => {
      const tb = e.target.closest('[data-tab]');
      if (tb) { setTab(tb.dataset.tab); return; }
      const del = e.target.closest('[data-del]');
      if (del) { removeSaved(+del.dataset.del); return; }
      const cl = e.target.closest('[data-clear]');
      if (cl) { input.value = ''; renderResults(); input.focus(); return; }
      const cmd = e.target.closest('[data-cmd]');
      if (cmd && lastParse) { onPick(lastParse.cmds[+cmd.dataset.cmd].target); return; }
      const f = e.target.closest('[data-filter]');
      if (f) { api.setFilter(f.dataset.filter); return; }
      const p = e.target.closest('[data-pick]');
      if (p) {
        if (justSwiped(p.closest('.nv-swipe-fg'))) return;
        const t = pickFromEl(p);
        if (t) onPick(t);
      }
    });
    root.querySelector('[role=tablist]').addEventListener('keydown', (e) => {
      const keys = TABS.map(([k]) => k), i = keys.indexOf(tab);
      // RTL: ArrowLeft moves to the next tab.
      if (e.key === 'ArrowLeft') { e.preventDefault(); setTab(keys[(i + 1) % keys.length], true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setTab(keys[(i - 1 + keys.length) % keys.length], true); }
      else if (e.key === 'Home') { e.preventDefault(); setTab(keys[0], true); }
      else if (e.key === 'End') { e.preventDefault(); setTab(keys[keys.length - 1], true); }
    });
    input.addEventListener('input', renderResults);
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; renderResults(); } });
    root.querySelector('[data-form]').addEventListener('submit', (e) => {
      e.preventDefault();
      const r = lastParse || parse(input.value);
      if (r.cmds.length) onPick(r.cmds[0].target);
    });
    // Page tab
    const pin = root.querySelector(`#${pfx}-page`), phint = root.querySelector('[data-pagehint]');
    const readPage = () => { const v = +toLatin(pin.value).replace(/[^\d]/g, ''); return v >= 1 && v <= total ? v : null; };
    pin.addEventListener('input', () => {
      const v = readPage();
      phint.classList.toggle('bad', !v && !!pin.value.trim());
      phint.textContent = v ? pageHint(v) : pin.value.trim() ? `اكتب رقماً بين ${n(1)} و${n(total)}.` : '';
      pin.setAttribute('aria-invalid', !v && !!pin.value.trim());
    });
    root.querySelector('[data-pageform]').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = readPage();
      if (!v) { phint.classList.add('bad'); phint.textContent = `اكتب رقماً بين ${n(1)} و${n(total)}.`; pin.setAttribute('aria-invalid', 'true'); pin.focus(); return; }
      onPick(pageTarget(v));
    });
    wireSwipe(root, (page) => removeSaved(page));

    const api = {
      el,
      root,
      setTab: (k) => setTab(k),
      tab: () => tab,
      focus: () => input.focus(),
      // Re-light the reader's current surah / juz / hizb / page without re-rendering.
      markHere() {
        const hh = here();
        const jz = juzOf(hh.s, hh.a), hz = hizbOf(hh.s, hh.a);
        root.querySelectorAll('.nv-sr').forEach((b) => { const on = +b.dataset.s === hh.s; b.classList.toggle('here', on); on ? b.setAttribute('aria-current', 'location') : b.removeAttribute('aria-current'); });
        root.querySelectorAll('.nv-juz .nv-cell').forEach((b) => { const on = +b.dataset.i === jz; b.classList.toggle('here', on); on ? b.setAttribute('aria-current', 'location') : b.removeAttribute('aria-current'); });
        root.querySelectorAll('.nv-hizb .nv-cell').forEach((b) => { const on = +b.dataset.i === hz; b.classList.toggle('here', on); on ? b.setAttribute('aria-current', 'location') : b.removeAttribute('aria-current'); });
        root.querySelectorAll('.nv-saved').forEach((b) => b.classList.toggle('here', +b.dataset.page === hh.page));
        const rib = root.querySelector('.ix-ribbox .ribbon');
        if (rib) rib.querySelectorAll('.bar').forEach((b, i) => b.classList.toggle('here', i === hh.s - 1));
      },
      refreshSaved() {
        const p = root.querySelector('[data-panel=saved]');
        if (p) p.innerHTML = savedPanel(here());
        const t = root.querySelector('[data-tab=saved]');
        if (t) t.innerHTML = `المحفوظة${QB.state.savedPages.length ? ` <span class="nv-tc">${n(QB.state.savedPages.length)}</span>` : ''}`;
      },
      setFilter(k) {
        filter = k;
        root.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.filter === k));
        root.querySelectorAll('[data-surahs] > li').forEach((li) => (li.hidden = k !== 'all' && li.dataset.type !== k));
        const rib = root.querySelector('.ix-ribbox .ribbon');
        if (rib) rib.querySelectorAll('.bar').forEach((b, i) => b.classList.toggle('dim', k !== 'all' && QB.data.index[i].type !== k));
        root.querySelectorAll('.ix-types i').forEach((x, i) => x.classList.toggle('dim', k !== 'all' && QB.data.index[i].type !== k));
        const rd = root.querySelector(`#${pfx}-read`);
        if (rd && api._rest) rd.textContent = api._rest();
      },
      // Scroll the surah list to surah i (0-based) and light the row briefly.
      revealSurah(i) {
        if (filter !== 'all' && QB.data.index[i].type !== filter) api.setFilter('all');
        const li = root.querySelector(`[data-surahs] > li[data-s="${i + 1}"]`);
        if (!li) return;
        li.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        // Fallback when smooth scrolling is throttled (background tabs): land there anyway.
        setTimeout(() => { const r = li.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) li.scrollIntoView({ block: 'center' }); }, 700);
        const b = li.querySelector('button');
        b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
      },
    };

    if (opts.ribbon) {
      const rest = () => {
        const list = QB.data.index.filter((s) => filter === 'all' || s.type === filter);
        const ay = list.reduce((t, s) => t + s.ayahs, 0);
        return filter === 'all' ? `${n(114)} سورة، ${n(QB.data.stats.ayahs || ay)} آية` : `${n(list.length)} سورة ${filter === 'meccan' ? 'مكّيّة' : 'مدنيّة'}، ${n(ay)} آية`;
      };
      api._rest = rest;
      let lastI = null;
      QB.wireRibbon(root.querySelector(`#${pfx}-rib`), root.querySelector(`#${pfx}-read`),
        (i) => { const s = QB.data.index[i]; return `${s.name}: ${ayahsTxt(s.ayahs)}، صفحة ${n(s.page)}، ${typeLabel(s.type)}`; },
        (i) => { if (i == null || i === lastI) return; lastI = i; api.revealSurah(i); setTimeout(() => { if (lastI === i) lastI = null; }, 400); },
        rest);
    }
    live.add(api);
    api.markHere();
    return api;
  };

  // Open a target from a panel: the Mushaf beside the panel for loaded pages, else the Reader.
  QB.navOpen = (t) => {
    const page = t.page || (t.s ? QB.pageOf(t.s, t.a || 1) : null);
    if (page && loaded(page)) {
      if (t.s && QB.pageOf(t.s, t.a || 1) === page) { QB.openVerse(t.s, t.a || 1); return; }
      if (QB.mushaf && QB.mushaf.goTo && QB.room.stageVisible() && QB.current() !== 'reader') { QB.mushaf.goTo({ page }); return; }
      QB.go('reader', { page });
      return;
    }
    if (page) QB.go('reader', { page });
    else QB.go('reader', { s: t.s, a: t.a || 1 });
  };

  /* ---------------- Screen: الفهرس ---------------- */
  let ixNav = null;
  QB.screen('index', {
    title: () => ['الفهرس', `${n(114)} سورة، ${n(30)} جزءاً، ${n(60)} حزباً`],
    world: 'reading',
    room: 'panel',
    panelWidth: 560,
    show(el, params = {}) {
      el.innerHTML = `<div class="nv-page">
        <header class="nv-head">
          <div><div class="kicker">القراءة</div><h2 class="h2">الفهرس</h2></div>
          <div class="nv-head-acts">${QB.room.toggleButton()}</div>
        </header>
        <div data-nav></div>
      </div>`;
      ixNav = QB.navigator(el.querySelector('[data-nav]'), {
        tab: params.tab || 'surahs',
        ribbon: true,
        onPick: (t) => { QB.navOpen(t); setTimeout(() => ixNav && ixNav.markHere(), 60); },
      });
    },
  });

  /* ---------------- Screen: الصفحات المحفوظة ---------------- */
  const svDraw = (el) => {
    const list = [...QB.state.savedPages].sort((x, y) => (x.at < y.at ? 1 : -1));
    const h = here();
    const nb = QB.state.notebook || [];
    const recent = nb.slice(0, 3);
    el.innerHTML = `<div class="nv-page sv">
      <header class="nv-head">
        <div><div class="kicker">القراءة</div><h2 class="h2">الصفحات المحفوظة</h2>${list.length ? `<p class="label">${pagesTxt(list.length)}، الأحدث أولاً</p>` : ''}</div>
        <div class="nv-head-acts">${QB.room.toggleButton()}</div>
      </header>
      ${list.length ? `<ul class="list sv-list">${list.map((b) => {
        const sur = pageSurah(b.page), words = firstWords(b.page), j = juzAtPage(b.page);
        const isHere = h.page === b.page;
        return `<li class="nv-swipe" data-page="${b.page}">
          <div class="nv-swipe-bg" aria-hidden="true"><span>${QB.ico('trash', 'sm')}إزالة</span><span>${QB.ico('trash', 'sm')}إزالة</span></div>
          <div class="nv-swipe-fg">
            <button class="sv-open${isHere ? ' here' : ''}" data-open="${b.page}" ${isHere ? 'aria-current="location"' : ''} aria-label="افتح صفحة ${n(b.page)}، سورة ${sur.name}">
              <span class="sv-pn">${n(b.page)}</span>
              <span class="sv-t">
                ${words ? `<span class="sv-q q" lang="ar">${words}…</span>` : '<span class="sv-q sv-q-none">نص هذه الصفحة غير محمّل في النموذج</span>'}
                <span class="sv-meta">${pos(b.page)}<span>سورة ${sur.name}، صفحة ${n(b.page)}، الجزء ${n(j.n)}</span><span class="sv-age">${isHere ? 'أنت هنا' : QB.age(b.at)}</span></span>
              </span>
            </button>
            <button class="icon-btn nv-del" data-del="${b.page}" aria-label="إزالة صفحة ${n(b.page)} من المحفوظات" title="إزالة من المحفوظات">${QB.ico('trash', 'sm')}</button>
          </div></li>`;
      }).join('')}</ul>
      <p class="label nv-hint">اسحب السطر جانباً لإزالته، أو استعمل زر الإزالة. تستطيع التراجع بعدها.</p>`
      : `<div class="empty-state sv-empty">${QB.ico('bookmark')}<h3 class="h3">لا صفحات محفوظة بعد</h3><p class="empty">احفظ صفحة من القراءة (علامة الحفظ في شريط القارئ) لتجدها هنا.</p><button class="cta sm" data-act="read">افتح المصحف</button></div>`}

      <section class="sv-verses" aria-labelledby="sv-verses-t">
        <div class="block-title"><h3 class="h3" id="sv-verses-t">آيات في الدفتر</h3><span class="label">${ayahsTxt(nb.length)}</span></div>
        <p class="sv-why">هنا تُحفظ الصفحات لتعود إليها؛ أمّا الآيات فتُحفظ في الدفتر مع مواضيعها.</p>
        ${recent.length ? `<ul class="list">${recent.map((x) => `<li><button class="row sv-vrow" data-verse="${x.s}:${x.a}"><span class="sv-dots">${(x.themes || []).map((id) => { const t = QB.theme(id); return t ? `<span class="th-dot" style="--c:${QB.thColor(t.color)}" title="${esc(t.name)}"></span>` : ''; }).join('') || '<span class="th-dot sv-nodot"></span>'}</span><span class="t">${QB.surah(x.s).name} ${n(x.a)}<small>${QB.age(x.at)}</small></span><span class="chev">${QB.ico('chevL', 'sm')}</span></button></li>`).join('')}</ul>` : ''}
        <button class="link" data-act="notebook">افتح آيات الدفتر ${QB.ico('chevL', 'sm')}</button>
      </section>
    </div>`;
  };
  let svEl = null;
  QB.on('state', ({ key }) => { if ((key === 'savedPages' || key === 'notebook') && svEl && QB.current() === 'saved') { const sc = svEl.scrollTop; svDraw(svEl); svEl.scrollTop = sc; } });
  QB.on('notebook', () => { if (svEl && QB.current() === 'saved') svDraw(svEl); });

  QB.screen('saved', {
    title: () => ['الصفحات المحفوظة', QB.state.savedPages.length ? pagesTxt(QB.state.savedPages.length) : 'لا صفحات بعد'],
    world: 'reading',
    room: 'panel',
    panelWidth: 520,
    mount(el) {
      svEl = el;
      el.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del]');
        if (del) { removeSaved(+del.dataset.del); QB.setTitle(); return; }
        const op = e.target.closest('[data-open]');
        if (op) { if (justSwiped(op.closest('.nv-swipe-fg'))) return; QB.navOpen({ page: +op.dataset.open }); return; }
        const v = e.target.closest('[data-verse]');
        if (v) { const [s, a] = v.dataset.verse.split(':').map(Number); QB.openVerse(s, a); return; }
        const t = e.target.closest('[data-act]');
        if (!t) return;
        if (t.dataset.act === 'notebook') QB.go('notebook', { tab: 'verses' });
        if (t.dataset.act === 'read') QB.go('reader', { page: (QB.state.lastRead || {}).page || 1 });
      });
      wireSwipe(el, (page) => { removeSaved(page); QB.setTitle(); });
      QB.on('state', ({ key }) => { if (key === 'savedPages' && QB.current() === 'saved') QB.setTitle(); });
    },
    show(el) { svEl = el; svDraw(el); },
  });
})();
