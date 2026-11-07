/* =====================================================================
   Basair web prototype: shared core.
   Exposes window.QB: data access, state, utilities, router, rail,
   overlays (sheet / modal / toast) and the docked recitation player.
   Screens live in screens/<name>.js and register with QB.screen().
   ===================================================================== */
(() => {
  const D = window.QB_DATA_MOBILE || window.QB || {};   // data.js (page 500, root بصر search, landing stats)
  const W = window.QBW || {};                           // data-web.js (page 500 morphology, spreads, translations)
  const F = window.QBF || {};                           // data-full.js (index, juz, pages 1/2/499/501, more searches, catalogues)
  const P = window.QBP || {};                           // data-pages.js (morphology + translations for pages 1/2/499/501)

  const QB = {};
  window.QB = QB;

  /* ---------------- Events ---------------- */
  const handlers = {};
  QB.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
  QB.emit = (ev, payload) => (handlers[ev] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });

  /* ---------------- State (in memory; a few viewer conveniences persist) ---------------- */
  const saved = (() => { try { return JSON.parse(localStorage.getItem('qb-proto') || '{}'); } catch (e) { return {}; } })();
  // Seed state for a signed-in researcher. Everything is in memory: actions update it and screens re-render.
  QB.state = Object.assign({
    theme: 'system',            // 'system' | 'dark' | 'light'
    numerals: 'arabic',         // 'arabic' (٠١٢) | 'latin' (012) | 'persian' (۰۱۲)
    uiLang: 'ar',               // 24 interface languages in production; only Arabic is drawn here
    reciter: 'alafasy',
    speed: 1,
    repeat: 'off',              // 'off' | 'ayah' | 'range'
    translations: ['english'],  // up to 3; the prototype has text for 'english' and 'french'
    readingMode: 'page',        // 'page' | 'ayahs'
    quranSize: 26,              // 18–48
    themeHighlight: true,       // «تظليل المواضيع»
    homeSections: { greeting: true, verse: true, resume: true, index: true, saved: true, study: true, community: true, search: true },
    user: { name: 'المشرف', email: 'maintainer@example.com', role: 'admin', medal: 0 },  // null = signed out; { guest: true } = guest
    lastRead: { page: 500, s: 45, a: 20, at: '2026-10-21T15:40' },
    // Saved pages (المحفوظة) are pages, as in production.
    savedPages: [{ page: 500, at: '2026-10-20' }, { page: 2, at: '2026-10-11' }, { page: 1, at: '2026-09-28' }],
    // Topic themes (مواضيع) colour saved verses; colour keys map to --th-<key>.
    themes: [
      { id: 't1', name: 'البصيرة', color: 'gold' },
      { id: 't2', name: 'الهداية', color: 'green' },
      { id: 't3', name: 'الرحمة', color: 'pink' },
      { id: 't4', name: 'بنو إسرائيل', color: 'blue' },
    ],
    // Verses saved to the notebook (الدفتر › الآيات), each with its themes.
    notebook: [
      { id: 'n1', s: 45, a: 20, themes: ['t1', 't2', 't3'], at: '2026-10-20' },
      { id: 'n2', s: 45, a: 18, themes: ['t2'], at: '2026-10-19' },
      { id: 'n3', s: 45, a: 16, themes: ['t4'], at: '2026-10-19' },
      { id: 'n4', s: 45, a: 17, themes: ['t4'], at: '2026-10-19' },
      { id: 'n5', s: 2, a: 2, themes: ['t2'], at: '2026-10-11' },
      { id: 'n6', s: 2, a: 5, themes: ['t2'], at: '2026-10-11' },
      { id: 'n7', s: 1, a: 6, themes: ['t2'], at: '2026-09-28' },
      { id: 'n8', s: 45, a: 23, themes: ['t1'], at: '2026-09-25' },
      { id: 'n9', s: 45, a: 13, themes: [], at: '2026-09-20' },
    ],
    // Boards belong to a theme. board.js fills nodes/edges on first open.
    boards: [
      { id: 'b1', themeId: 't1', name: 'من البصر إلى البصيرة', at: '2026-10-20' },
      { id: 'b2', themeId: 't4', name: 'بنو إسرائيل في الجاثية', at: '2026-10-19' },
    ],
    // Study sessions. study.js fills messages on first open when absent.
    sessions: [
      { id: 's1', title: 'من هم بنو إسرائيل في القرآن؟', mode: 'strict', at: '2026-10-20', count: 4 },
      { id: 's2', title: 'ما الفرق بين البصر والبصيرة؟', mode: 'tafsir', at: '2026-10-17', count: 2 },
      { id: 's3', title: 'الهدى في سورة البقرة', mode: 'strict', at: '2026-10-09', count: 2 },
    ],
    // Research documents (الأبحاث). document.js fills sections on first open when absent.
    documents: [
      { id: 'd1', title: 'البصيرة في القرآن', from: 'board', boardId: 'b1', at: '2026-10-20', status: 'draft' },
      { id: 'd2', title: 'بنو إسرائيل: النعمة والاختلاف', from: 'studio', sessionId: 's1', at: '2026-10-18', status: 'published', postId: 'p2' },
    ],
    followedRoots: ['بصر', 'هدي', 'نور'],
    // posts: community.js seeds QB.state.posts when absent; document publishing pushes into it.
  }, saved);
  const PERSIST = ['theme', 'numerals', 'quranSize', 'readingMode', 'translations', 'reciter', 'speed', 'uiLang', 'homeSections', 'themeHighlight'];
  QB.set = (key, value) => {
    QB.state[key] = value;
    if (key === 'user') { try { renderRail(); } catch (e) {} }
    if (PERSIST.includes(key)) {
      try { const keep = {}; PERSIST.forEach((k) => (keep[k] = QB.state[k])); localStorage.setItem('qb-proto', JSON.stringify(keep)); } catch (e) {}
    }
    QB.emit('state', { key, value });
  };

  /* ---------------- Utilities ---------------- */
  QB.n = (n) => {
    if (QB.state.numerals === 'latin') return String(n);
    const loc = QB.state.numerals === 'persian' ? 'fa-IR' : 'ar-EG';
    return String(n).replace(/\d+(\.\d+)?/g, (m) => Number(m).toLocaleString(loc, { useGrouping: false, maximumFractionDigits: 2 }));
  };
  // Relative age from the prototype's "today" (2026-10-21).
  QB.today = new Date('2026-10-21T16:00:00');
  QB.age = (iso) => {
    const day = (x) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate());
    const d = Math.round((day(QB.today) - day(new Date(iso))) / 86400000);
    if (d <= 0) return 'اليوم';
    if (d === 1) return 'أمس';
    if (d === 2) return 'قبل يومين';
    if (d < 11) return `قبل ${QB.n(d)} أيام`;
    if (d < 30) return `قبل ${QB.n(d)} يوماً`;
    const m = Math.round(d / 30);
    return m === 1 ? 'قبل شهر' : `قبل ${QB.n(m)} أشهر`;
  };
  QB.uid = (p = 'x') => p + Math.random().toString(36).slice(2, 8);
  QB.theme = (id) => QB.state.themes.find((t) => t.id === id);
  QB.thColor = (key) => `var(--th-${key || 'gray'})`;
  QB.signedIn = () => !!(QB.state.user && !QB.state.user.guest);
  QB.esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  QB.strip = (s) => String(s || '').replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[ٱأإآ]/g, 'ا');
  QB.words = (text) => text.split(' ');
  QB.$ = (sel, root = document) => root.querySelector(sel);
  QB.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  QB.letters = (root) => [...root].join(' ');

  /* ---------------- Data access ---------------- */
  QB.data = {
    stats: D.stats || { surahs: 114, ayahs: 6236, words: 77430, roots: 1651, pages: 604, reciters: 8 },
    names: D.names || (F.index || []).map((s) => s.name),
    index: F.index || [],          // [{id, name, en, type: 'meccan'|'medinan', ayahs, page, juz}]
    juz: F.juz || [],              // [{n, s, a, page}]
    mushafs: F.mushafs || [],      // [{id, name, description, riwayah}]
    reciters: F.reciters || [],    // [{id, name, en, style, audio}]
    translations: F.translations || [], // [{key, lang, name}]
  };
  QB.surah = (id) => QB.data.index[id - 1] || { id, name: QB.data.names[id - 1] || '', en: '', type: '', ayahs: 0, page: 0, juz: 0 };
  QB.pageNumbers = [1, 2, 499, 500, 501];
  QB.page = (n) => {
    if (n === 500 && D.page) return { n: 500, juz: D.page.juz, surahs: [{ id: 45, name: D.page.surah }], ayahs: D.page.ayahs };
    const p = (F.pages || {})[n];
    return p ? { n: p.n, juz: p.juz, surahs: p.surahs, ayahs: p.ayahs } : null;
  };
  QB.pageOf = (s, a) => QB.pageNumbers.find((n) => { const p = QB.page(n); return p && p.ayahs.some((x) => x.s === s && x.a === a); }) || null;
  QB.ayah = (s, a) => { for (const n of QB.pageNumbers) { const p = QB.page(n); const hit = p && p.ayahs.find((x) => x.s === s && x.a === a); if (hit) return hit; } return null; };
  QB.morph = (s, a) => (s === 45 && W.morphPage && W.morphPage[a]) || (P.morph || {})[`${s}:${a}`] || (s === 45 && a === 20 ? D.morph : null) || null;
  QB.trans = (s, a) => (s === 45 && W.trans && W.trans[a]) || (P.trans || {})[`${s}:${a}`] || null;
  QB.spread = (root) => (W.spreadsAll || {})[root] || (P.spreads || {})[root] || (F.spreadsMore || {})[root] || (D.spreads || {})[root] || null;
  QB.search = (root) => (root === 'بصر' ? D.search : (F.searches || {})[root]) || null;  // {root,total,verses_total,surahs,verses:[{s,name,a,text,hl:[1-based word positions]}]}
  QB.searchRoots = () => ['بصر', ...Object.keys(F.searches || {})];
  QB.allRoots = () => [...new Set([...Object.keys(W.spreadsAll || {}), ...Object.keys(P.spreads || {}), ...Object.keys(F.spreadsMore || {})])];
  QB.findRoot = (q) => { const k = QB.strip((q || '').replace(/\s/g, '')); return QB.allRoots().find((r) => QB.strip(r) === k) || null; };

  /* ---------------- Icons ---------------- */
  QB.icons = {
    home: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    book: '<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
    list: '<path d="M5 7h14M5 12h14M5 17h14"/>',
    bookmark: '<path d="M7 4h10v16l-5-4-5 4z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    study: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    note: '<path d="M7 3h8l4 4v14H7z"/><path d="M10 11h6M10 15h6"/>',
    people: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="8" r="2.4"/><path d="M15.5 13.6A4.5 4.5 0 0 1 21 18"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4.4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4.4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
    inbox: '<path d="M4 13l2.5-8h11L20 13v6H4z"/><path d="M4 13h5l1 2h4l1-2h5"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    chevL: '<path d="M14 6l-6 6 6 6"/>',
    chevR: '<path d="M10 6l6 6-6 6"/>',
    chevD: '<path d="M6 10l6 6 6-6"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
    next: '<path d="M18 6v12L9 12z" fill="currentColor" stroke="none"/><path d="M7 6v12"/>',
    prev: '<path d="M6 6v12l9-6z" fill="currentColor" stroke="none"/><path d="M17 6v12"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
    repeat: '<path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    comment: '<path d="M4 5h16v11H9l-5 4z"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
    send: '<path d="M20 4L4 11l6 2 2 6z"/><path d="M10 13l4-4"/>',
    board: '<rect x="3.5" y="4" width="7" height="7" rx="1.5"/><rect x="13.5" y="4" width="7" height="4" rx="1.5"/><rect x="13.5" y="11" width="7" height="9" rx="1.5"/><rect x="3.5" y="14" width="7" height="6" rx="1.5"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
    tag: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/>',
    logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    layers: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  };
  QB.ico = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${QB.icons[name] || ''}</svg>`;
  QB.mark = (size = 36) => `<svg width="${size}" height="${size}" viewBox="-30 -30 60 60" aria-hidden="true"><g fill="none" stroke="var(--gold)" stroke-width="2"><rect x="-17" y="-17" width="34" height="34"/><rect x="-17" y="-17" width="34" height="34" transform="rotate(45)"/><circle r="13"/></g><text y="7" text-anchor="middle" font-family="Amiri" font-size="20" fill="var(--gold-text)">ب</text></svg>`;

  /* ---------------- Signature devices ---------------- */
  // The landing's eight-fold rosette (features/site/landing/pattern.tsx), same geometry.
  QB.girih = (cls = '') => {
    const pt = (r, a) => { a = (a * Math.PI) / 180; return `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`; };
    const sq = (r, t) => 'M' + [0, 90, 180, 270].map((a) => pt(r, a + t)).join('L') + 'Z';
    const radii = [64, 112, 172, 244, 328, 424], out = [];
    radii.forEach((r, ring) => { const t = ring % 2 ? 22.5 : 0; out.push([sq(r, t), ring], [sq(r, t + 45), ring]); const c = r * 0.78; out.push([`M${c} 0A${c} ${c} 0 1 1 ${-c} 0A${c} ${c} 0 1 1 ${c} 0`, ring]); });
    for (let i = 0; i < 16; i++) out.push([`M${pt(64, i * 22.5)}L${pt(470, i * 22.5)}`, radii.length]);
    return `<svg class="girih ${cls}" viewBox="-480 -480 960 960" aria-hidden="true">${out.map(([d, ring]) => `<path d="${d}" pathLength="1" style="--ring:${ring}"/>`).join('')}</svg>`;
  };
  // 114 bars, Al-Fātiḥa on the right. opts: {here, focus, flat, live, grow, id, label}
  QB.ribbon = (counts, o = {}) => {
    const peak = Math.max(1, ...counts);
    return `<div class="ribbon${o.live ? ' live' : ''}${o.grow ? ' grow' : ''}" role="img" aria-label="${QB.esc(o.label || 'الانتشار في السور')}" ${o.id ? `id="${o.id}"` : ''}>` + counts.map((c, i) => {
      const h = o.flat ? (c ? 1 : 0.32) : c ? 0.12 + 0.88 * Math.sqrt(c / peak) : 0.05;
      const cls = ['bar', c ? 'on' : '', o.here === i ? 'here' : '', o.focus != null && o.focus !== i ? 'dim' : ''].join(' ');
      return `<span class="${cls}" data-i="${i}" style="--h:${h};--i:${i}"></span>`;
    }).join('') + '</div>';
  };
  QB.miniRibbon = (counts) => { const peak = Math.max(1, ...counts); return `<span class="mini-rib" aria-hidden="true">${counts.map((c) => `<i style="height:${c ? 15 + 85 * Math.sqrt(c / peak) : 0}%"></i>`).join('')}</span>`; };
  // Hover readout + optional click/drag pick. onPick(i|null).
  QB.wireRibbon = (rib, readout, text, onPick, rest) => {
    if (!rib) return;
    const at = (x) => [...rib.children].find((b) => { const r = b.getBoundingClientRect(); return x >= r.left - 1 && x <= r.right + 1; });
    const show = (i) => { if (readout) readout.textContent = i == null ? (rest ? rest() : '') : text(i); rib.querySelectorAll('.bar').forEach((b, k) => b.classList.toggle('hov', k === i)); };
    let drag = false;
    rib.addEventListener('pointermove', (e) => { const b = at(e.clientX); if (!b) return; show(+b.dataset.i); if (drag && onPick) onPick(+b.dataset.i); });
    rib.addEventListener('pointerleave', () => { if (!drag) show(null); });
    if (onPick) {
      rib.addEventListener('pointerdown', (e) => { drag = true; try { rib.setPointerCapture(e.pointerId); } catch (_) {} const b = at(e.clientX); if (b) onPick(+b.dataset.i); });
      rib.addEventListener('pointerup', () => { drag = false; });
      rib.tabIndex = 0;
      let k = null;
      rib.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') k = Math.min(113, (k ?? -1) + 1);
        else if (e.key === 'ArrowRight') k = Math.max(0, (k ?? 1) - 1);
        else if (e.key === 'Escape') k = null;
        else return;
        e.preventDefault(); show(k); onPick(k);
      });
    }
    show(null);
  };

  /* ---------------- Overlays ---------------- */
  let toastT;
  // QB.toast(msg) or QB.toast(msg, { action: 'تراجَع', onAction }) — an action keeps it up for 6s.
  QB.toast = (msg, opts = {}) => {
    const t = QB.$('#toast');
    t.innerHTML = `<span>${QB.esc(msg)}</span>${opts.action ? `<button type="button">${QB.esc(opts.action)}</button>` : ''}`;
    if (opts.action) t.querySelector('button').addEventListener('click', () => { t.classList.remove('on'); clearTimeout(toastT); opts.onAction && opts.onAction(); });
    t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), opts.action ? 6000 : 2600);
  };
  QB.soon = (what) => QB.toast(`«${what}» خارج هذا النموذج.`);
  const scrim = () => QB.$('#scrim');
  QB.closeOverlays = () => { QB.$$('.sheet.on, .modal.on').forEach((el) => el.classList.remove('on')); scrim().classList.remove('on'); QB.emit('overlay-closed'); };
  // QB.sheet({title, render(bodyEl, close)}) opens a side sheet from the left edge.
  QB.sheet = ({ title, render, width }) => {
    const el = QB.$('#sheet');
    el.style.width = width ? `min(${width}px, 100%)` : '';
    el.innerHTML = `<div class="sheet-head"><h2 class="h3">${title}</h2><button class="icon-btn" data-close aria-label="إغلاق">${QB.ico('x', 'sm')}</button></div><div class="sheet-body"></div>`;
    el.querySelector('[data-close]').addEventListener('click', QB.closeOverlays);
    render(el.querySelector('.sheet-body'), QB.closeOverlays);
    scrim().classList.add('on'); el.classList.add('on');
    setTimeout(() => el.querySelector('button, input, select, textarea, [tabindex]')?.focus(), 50);
  };
  // QB.modal({render(bodyEl, close)}) opens a centred dialog. Build any confirmation inside it.
  QB.modal = ({ render }) => {
    const el = QB.$('#modal');
    el.innerHTML = '<div class="modal-body"></div>';
    render(el.querySelector('.modal-body'), QB.closeOverlays);
    scrim().classList.add('on'); el.classList.add('on');
    setTimeout(() => el.querySelector('button, input, select, textarea')?.focus(), 50);
  };
  QB.confirm = ({ title, body, confirm, danger, onConfirm }) => QB.modal({ render: (b, close) => {
    b.innerHTML = `<h2 class="h2">${title}</h2><p class="lede">${body}</p><div style="display:flex;gap:10px;justify-content:flex-start"><button class="cta sm" data-ok style="${danger ? 'background:var(--bad);color:var(--bg);box-shadow:none' : ''}">${confirm}</button><button class="ghost sm" data-no>إلغاء</button></div>`;
    b.querySelector('[data-ok]').addEventListener('click', () => { close(); onConfirm && onConfirm(); });
    b.querySelector('[data-no]').addEventListener('click', close);
  } });

  /* ---------------- Router ---------------- */
  const screens = {};
  let current = null, currentParams = {};
  /* QB.screen(name, {
       title(params) -> [title, subtitle],
       world: 'reading' | 'research' | 'community'   (tint; default reading)
       room: false | 'panel' | 'mushaf'               (see below)
       panelWidth: 520,                               (room screens)
       mount(el), show(el, params), hide?(el) })
     Room screens share one Mushaf (QB.mushaf, built by screens/reader.js). On wide screens the
     Mushaf sits on the right and the screen's panel on the left. `el` handed to mount/show is the
     PANEL element. room:'panel' → under 1000px only the panel shows; room:'mushaf' → the Mushaf
     shows first and the panel stacks under it (the Reader). */
  QB.screen = (name, def) => { screens[name] = def; };
  QB.current = () => current;
  QB.params = () => currentParams;
  const isWide = () => window.matchMedia('(min-width: 1001px)').matches;
  QB.room = {
    // Is the shared Mushaf visible next to the current panel right now?
    stageVisible: () => !!(current && screens[current].room && isWide() && !QB.$(`#view-${current} .room`)?.classList.contains('wide')),
    // Toggle the panel to full width (hides the Mushaf) and back.
    setWide(on) { const r = QB.$(`#view-${current} .room`); if (r) { r.classList.toggle('wide', on); QB.emit('room', { wide: on }); } },
    isWide: () => !!QB.$(`#view-${current} .room`)?.classList.contains('wide'),
    // A small button a panel can put in its header.
    toggleButton: () => `<button class="icon-btn" data-room-toggle aria-label="${QB.room.isWide() ? 'أظهر المصحف بجانب اللوحة' : 'وسّع اللوحة'}" title="${QB.room.isWide() ? 'أظهر المصحف' : 'وسّع اللوحة'}">${QB.ico(QB.room.isWide() ? 'book' : 'layers', 'sm')}</button>`,
  };
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-room-toggle]'); if (t) { QB.room.setWide(!QB.room.isWide()); t.outerHTML = QB.room.toggleButton(); } });
  // Open a verse: in the Mushaf beside the panel when it is visible, otherwise in the Reader.
  QB.openVerse = (s, a, opts = {}) => {
    if (QB.mushaf && QB.room.stageVisible() && current !== 'reader') QB.mushaf.goTo({ s, a }, { flash: true });
    else QB.go('reader', Object.assign({ s, a }, opts));
  };
  QB.go = (name, params = {}) => {
    if (!screens[name]) { QB.soon(name); return; }
    QB.closeOverlays();
    const def = screens[name];
    const prev = current;
    if (prev && screens[prev].hide) screens[prev].hide(QB.$(`#view-${prev}`));
    let view = QB.$(`#view-${name}`);
    if (!view) {
      view = document.createElement('section'); view.className = 'view'; view.id = `view-${name}`;
      if (def.room) view.innerHTML = `<div class="room" data-first="${def.room}" style="--panel-w:${def.panelWidth || 520}px"><div class="room-stage"></div><div class="room-panel"></div></div>`;
      QB.$('#main').appendChild(view);
    }
    const el = def.room ? view.querySelector('.room-panel') : view;
    if (def.room && QB.mushaf && QB.mushaf.el) view.querySelector('.room-stage').appendChild(QB.mushaf.el);
    if (!view.dataset.mounted) { def.mount && def.mount(el); view.dataset.mounted = '1'; }
    current = name; currentParams = params;
    QB.$('#app').dataset.world = def.world || 'reading';
    QB.$('#main').classList.toggle('is-room', !!def.room);
    QB.$$('.view').forEach((v) => v.classList.toggle('on', v === view));
    QB.$$('.ri[data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === name || (b.dataset.also || '').split(' ').includes(name)));
    if (!params.keepScroll) { QB.$('#main').scrollTop = 0; el.scrollTop = 0; }
    def.show && def.show(el, params);
    QB.setTitle();
    try { history.replaceState(null, '', '#' + name); } catch (e) {}
    QB.emit('route', { name, params });
  };
  QB.setTitle = () => {
    const [t, sub] = (screens[current] && screens[current].title) ? screens[current].title(currentParams) : ['', ''];
    QB.$('#crumb-title').textContent = t || '';
    QB.$('#crumb-sub').textContent = sub || '';
  };

  /* ---------------- Theme ---------------- */
  const applyTheme = () => {
    const root = document.documentElement;
    if (QB.state.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', QB.state.theme);
  };
  QB.isDark = () => getComputedStyle(document.documentElement).colorScheme.includes('dark');
  QB.on('state', ({ key }) => { if (key === 'theme') { applyTheme(); try { renderRail(); } catch (e) {} } if (key === 'numerals' && current) { QB.go(current, Object.assign({}, currentParams, { keepScroll: true })); } });

  /* ---------------- Rail ---------------- */
  // Order and labels follow today's desktop rail.
  // Order and labels follow today's desktop rail (features/shell/left-rail.tsx).
  QB.nav = [
    { id: 'reader', icon: 'book', label: 'المصحف' },
    { id: 'index', icon: 'list', label: 'الفهرس' },
    { id: 'saved', icon: 'bookmark', label: 'المحفوظة' },
    '-',
    { id: 'search', icon: 'search', label: 'البحث', also: 'heatmap' },
    { id: 'study', icon: 'study', label: 'الدراسة' },
    { id: 'notebook', icon: 'note', label: 'الدفتر', also: 'document board' },
    '-',
    { id: 'community', icon: 'people', label: 'المجتمع', also: 'post' },
    'spacer',
    { action: 'theme', label: 'السمة' },
    { id: 'settings', icon: 'gear', label: 'إعدادات' },
    { action: 'account' },
  ];
  const medalLetter = () => (QB.state.user && QB.state.user.name ? QB.state.user.name[0] : 'ب');
  // settings.js may define QB.medal(i, size, letter) to draw the chosen medal.
  const medalSvg = (size) => (QB.medal && QB.state.user ? QB.medal(QB.state.user.medal || 0, size, medalLetter()) : medalLetter());
  function renderRail() {
    const rail = QB.$('#rail');
    rail.innerHTML = `<button class="logo" data-go="home" aria-label="الرئيسية">${QB.mark(36)}</button>` + QB.nav.map((it) => {
      if (it === '-') return '<hr>';
      if (it === 'spacer') return '<span class="spacer"></span>';
      if (it.action === 'theme') return `<button class="ri" data-action="theme" title="${QB.isDark() ? 'التبديل إلى السِّمة الفاتحة' : 'التبديل إلى السِّمة الداكنة'}">${QB.ico(QB.isDark() ? 'sun' : 'moon')}<span>${it.label}</span></button>`;
      if (it.action === 'account') return QB.signedIn()
        ? `<button class="ri" data-action="account" data-also="account" aria-haspopup="dialog"><span class="avatar avatar-sm">${medalSvg(24)}</span><span>حسابي</span></button>`
        : `<button class="ri" data-go="account">${QB.ico('user')}<span>دخول</span></button>`;
      return `<button class="ri" data-go="${it.id}" ${it.also ? `data-also="${it.also}"` : ''}>${QB.ico(it.icon)}<span>${it.label}</span></button>`;
    }).join('');
    rail.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => QB.go(b.dataset.go)));
    rail.querySelector('[data-action="theme"]').addEventListener('click', () => { QB.set('theme', QB.isDark() ? 'light' : 'dark'); renderRail(); });
    const acc = rail.querySelector('[data-action="account"]');
    if (acc) acc.addEventListener('click', (e) => { e.stopPropagation(); toggleAccount(); });
    QB.$$('.ri[data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === current || (b.dataset.also || '').split(' ').includes(current)));
  }
  function toggleAccount(force) {
    const p = QB.$('#popover');
    const on = force ?? !p.classList.contains('on');
    if (!on) { p.classList.remove('on'); return; }
    const u = QB.state.user;
    p.innerHTML = `<div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="width:44px;height:44px;font-size:20px">${medalSvg(42)}</span><div><b style="font-family:var(--font-head);font-size:17px">${QB.esc(u.name)}</b><div class="label" dir="ltr" style="text-align:right">${QB.esc(u.email || '')}</div></div></div>
      <span class="sync">محفوظاتك تُزامَن تلقائياً</span>
      <hr class="rule">
      <button class="quiet" data-p="settings">${QB.ico('gear', 'sm')}الإعدادات والأجهزة ›</button>
      <button class="quiet danger" data-p="logout">${QB.ico('logout', 'sm')}تسجيل الخروج</button>`;
    p.querySelector('[data-p=settings]').addEventListener('click', () => { toggleAccount(false); QB.go('settings', { section: 'account' }); });
    p.querySelector('[data-p=logout]').addEventListener('click', () => { toggleAccount(false); QB.set('user', null); QB.toast('خرجت من حسابك. محفوظات هذا الجهاز باقية.'); QB.go('home'); });
    p.classList.add('on');
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('#popover')) QB.$('#popover')?.classList.remove('on'); });

  /* ---------------- Account gate ---------------- */
  // QB.requireAccount('الدراسة', fn): signed in → fn(); otherwise the production gate dialog.
  QB.requireAccount = (what, fn, verb = 'تتطلّب') => {
    if (QB.signedIn()) { fn && fn(); return true; }
    QB.modal({ render: (b, close) => {
      b.innerHTML = `<div style="display:flex;justify-content:center">${QB.mark(56)}</div><h2 class="h2" style="text-align:center">${what} ${verb} حساباً</h2>
        <p class="lede" style="text-align:center">حسابٌ مجاني يحفظ جلساتك ومحفوظاتك ويزامنها بين أجهزتك. ما حفظته كضيف يُضمّ إليه تلقائياً.</p>
        <div style="display:flex;flex-direction:column;gap:10px"><button class="cta" data-g="signup">أنشئ حساباً</button><button class="ghost" data-g="login">تسجيل الدخول</button><button class="quiet" data-g="later" style="justify-content:center">لاحقاً</button></div>`;
      b.querySelector('[data-g=signup]').addEventListener('click', () => { close(); QB.go('account', { tab: 'signup' }); });
      b.querySelector('[data-g=login]').addEventListener('click', () => { close(); QB.go('account', { tab: 'login' }); });
      b.querySelector('[data-g=later]').addEventListener('click', close);
    } });
    return false;
  };

  /* ---------------- «حفظ وتظليل»: save a verse with topic themes ---------------- */
  QB.swatchKeys = [['green', 'أخضر'], ['blue', 'أزرق'], ['pink', 'وردي'], ['purple', 'بنفسجي'], ['teal', 'فيروزي'], ['sand', 'رملي'], ['gold', 'ذهبي'], ['gray', 'رمادي']];
  QB.noteOf = (s, a) => QB.state.notebook.find((x) => x.s === s && x.a === a) || null;
  // QB.saveAyah(s, a, text?) — text lets callers show verses that aren't on a loaded page.
  QB.saveAyah = (s, a, text) => {
    const existing = QB.noteOf(s, a);
    let picked = new Set(existing ? existing.themes : []);
    let newColor = 'teal';
    const v = QB.ayah(s, a) || (text ? { s, a, text } : null);
    QB.sheet({ title: existing ? 'تعديل المواضيع' : 'حفظ وتظليل', render: (b, close) => {
      const draw = () => {
        b.innerHTML = `<div class="label">سورة ${QB.surah(s).name}، الآية ${QB.n(a)}</div>
          ${v ? `<div class="verse-preview" lang="ar">${v.text}</div>` : ''}
          <div><div class="block-title"><h3 class="h3">المواضيع</h3></div>
            ${QB.state.themes.length ? `<div class="chips">${QB.state.themes.map((t) => `<button class="th-chip" data-t="${t.id}" aria-pressed="${picked.has(t.id)}" style="--c:${QB.thColor(t.color)}"><span class="th-dot"></span>${QB.esc(t.name)}</button>`).join('')}</div>`
              : '<p class="empty">ظلِّل الآية بموضوع لتجتمع الآيات المتقاربة معاً في الدفتر، ثم أنشئ لها لوحة لربطها.</p>'}
            ${[...picked].map((id) => { const t = QB.theme(id); return t ? `<button class="link" data-boards="${id}" style="margin-top:10px;margin-inline-end:12px">لوحات «${QB.esc(t.name)}» ${QB.ico('chevL', 'sm')}</button>` : ''; }).join('')}
          </div>
          <div class="field"><span>موضوع جديد</span>
            <div style="display:flex;gap:8px"><input class="input" id="qb-new-theme" placeholder="مثلاً: الصبر، آيات الخلق…"><button class="ghost sm" data-add>إضافة</button></div>
            <div class="swatches" role="radiogroup" aria-label="لون الموضوع">${QB.swatchKeys.map(([k, l]) => `<button class="swatch" role="radio" aria-label="${l}" aria-pressed="${k === newColor}" data-c="${k}" style="--c:${QB.thColor(k)}"></button>`).join('')}</div>
          </div>
          <div style="display:flex;gap:10px;margin-top:auto">
            <button class="cta" data-done style="flex:1">تمّ</button>
            ${existing ? '<button class="quiet danger" data-remove>إزالة من الدفتر</button>' : ''}
          </div>`;
        b.querySelectorAll('[data-t]').forEach((x) => x.addEventListener('click', () => { picked.has(x.dataset.t) ? picked.delete(x.dataset.t) : picked.add(x.dataset.t); draw(); }));
        b.querySelectorAll('[data-c]').forEach((x) => x.addEventListener('click', () => { newColor = x.dataset.c; const keep = b.querySelector('#qb-new-theme').value; draw(); b.querySelector('#qb-new-theme').value = keep; }));
        b.querySelector('[data-add]').addEventListener('click', () => {
          const name = b.querySelector('#qb-new-theme').value.trim();
          if (!name) { b.querySelector('#qb-new-theme').focus(); return; }
          const t = { id: QB.uid('t'), name, color: newColor }; QB.state.themes.push(t); picked.add(t.id); draw();
        });
        b.querySelectorAll('[data-boards]').forEach((x) => x.addEventListener('click', () => { commit(); close(); QB.go('notebook', { tab: 'boards', focus: x.dataset.boards }); }));
        b.querySelector('[data-done]').addEventListener('click', () => { commit(); close(); QB.toast(existing ? 'حُدّثت مواضيع الآية.' : 'حُفظت الآية في الدفتر.'); });
        const rm = b.querySelector('[data-remove]');
        if (rm) rm.addEventListener('click', () => { QB.state.notebook = QB.state.notebook.filter((x) => x !== existing); close(); QB.emit('notebook'); QB.toast('أُزيلت الآية من الدفتر.'); });
      };
      const commit = () => {
        if (existing) existing.themes = [...picked];
        else QB.state.notebook.unshift({ id: QB.uid('n'), s, a, themes: [...picked], at: QB.today.toISOString() });
        QB.emit('notebook');
      };
      draw();
    } });
  };

  /* ---------------- Shortcuts dialog (?) ---------------- */
  QB.shortcuts = () => QB.modal({ render: (b, close) => {
    b.innerHTML = `<h2 class="h2">اختصارات لوحة المفاتيح</h2><div class="shortcuts">
      <span><kbd class="key">Ctrl K</kbd> <kbd class="key">/</kbd></span><span>فتح شريط الأوامر</span>
      <span><kbd class="key">?</kbd></span><span>عرض اختصارات لوحة المفاتيح</span>
      <span><kbd class="key">Esc</kbd></span><span>إغلاق النوافذ المنبثقة</span>
      <span><kbd class="key">PageUp</kbd> <kbd class="key">PageDown</kbd></span><span>الصفحة السابقة والتالية في المصحف</span>
      <span><kbd class="key">0</kbd> <kbd class="key">1</kbd> <kbd class="key">2</kbd></span><span>أدوات القراءة: قراءة، تحديد، تظليل</span>
      <span><kbd class="key">Shift M</kbd></span><span>طريقة القراءة: صفحات أو آية آية</span>
      <span><kbd class="key">F</kbd></span><span>وضع التركيز</span>
    </div><button class="ghost sm" data-x style="align-self:flex-start">إغلاق</button>`;
    b.querySelector('[data-x]').addEventListener('click', close);
  } });

  /* ---------------- Command bar ---------------- */
  // Enter: a root (any root on the loaded pages) opens Search; "45:20" or "الجاثية ٢٠" opens the Reader there.
  function wireCommand() {
    const form = QB.$('#cmd'), input = QB.$('#cmd-input');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = input.value.trim();
      const digits = raw.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
      const ref = digits.match(/^(\d{1,3})\s*[:：]\s*(\d{1,3})$/);
      if (ref) { const s = +ref[1], a = +ref[2]; if (QB.pageOf(s, a)) { QB.go('reader', { s, a }); input.blur(); return; } QB.toast('هذه الآية خارج الصفحات المحمّلة في النموذج (١، ٢، ٤٩٩–٥٠١).'); return; }
      const root = QB.findRoot(raw);
      if (root) { QB.go('search', { q: root, mode: 'root' }); input.blur(); return; }
      if (raw.length > 12 || /[؟?]/.test(raw)) { QB.go('study', { ask: raw }); input.blur(); return; }
      QB.go('search', { q: raw, mode: 'root' }); input.blur();
    });
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); input.select(); }
      else if (!typing && e.key === '/') { e.preventDefault(); input.focus(); input.select(); }
      else if (!typing && e.key === '?') { e.preventDefault(); QB.shortcuts(); }
      if (e.key === 'Escape') { QB.closeOverlays(); QB.$('#popover')?.classList.remove('on'); }
    });
  }

  /* ---------------- Recitation player (docked) ---------------- */
  // QB.player.start({ ayahs: [{s,a,text}], idx }) plays a run of verses; screens listen to 'rec' events
  // ({on, s, a, word}) to light the verse and word being recited.
  const rec = { on: false, playing: false, list: [], idx: 0, word: -1, p: 0, timer: null, audio: null, silent: false, repeatLeft: 0 };
  QB.player = {
    state: rec,
    start({ ayahs, idx = 0 }) { rec.list = ayahs; rec.on = true; rec.idx = Math.max(0, idx); rec.word = -1; rec.p = 0; rec.playing = true; renderDock(); playAyah(); },
    toggle() { if (!rec.on) return; if (rec.playing) pause(); else { rec.playing = true; playAyah(true); } },
    stop() { pause(); rec.on = false; renderDock(); QB.emit('rec', { on: false }); },
    jump(i) { if (i < 0 || i >= rec.list.length) return; rec.idx = i; rec.word = -1; rec.p = 0; if (rec.playing) playAyah(); else paint(); },
  };
  const reciter = () => QB.data.reciters.find((r) => r.id === QB.state.reciter) || QB.data.reciters[0] || { name: 'مشاري راشد العفاسي', audio: 'https://everyayah.com/data/Alafasy_128kbps' };
  function renderDock() {
    const d = QB.$('#dock');
    d.classList.toggle('on', rec.on);
    if (!rec.on) { d.innerHTML = ''; return; }
    const first = rec.list[0], last = rec.list[rec.list.length - 1];
    d.innerHTML = `
      <div class="ctl">
        <button class="side" data-k="next" aria-label="الآية التالية">${QB.ico('next')}</button>
        <button class="play" data-k="play" aria-label="تشغيل"></button>
        <button class="side" data-k="prev" aria-label="الآية السابقة">${QB.ico('prev')}</button>
      </div>
      <button class="who" data-k="reciter" style="text-align:start"><b>${reciter().name}</b><span data-k="ref"></span></button>
      <div class="track"><div class="seg">${rec.list.map(() => '<span></span>').join('')}</div>
        <div class="seg-axis"><span>${QB.surah(first.s).name} ${QB.n(first.a)}</span><span data-k="note"></span><span>${QB.surah(last.s).name} ${QB.n(last.a)}</span></div></div>
      <div class="opts">
        <button class="chip" data-k="speed" aria-label="السرعة">${QB.n(QB.state.speed)}×</button>
        <button class="chip" data-k="repeat" aria-pressed="${QB.state.repeat !== 'off'}">${QB.ico('repeat', 'sm')}${{ off: 'بلا تكرار', ayah: 'تكرار الآية', range: 'تكرار النطاق' }[QB.state.repeat]}</button>
      </div>
      <button class="icon-btn" data-k="close" aria-label="أغلق التلاوة">${QB.ico('x', 'sm')}</button>`;
    d.querySelector('[data-k=play]').addEventListener('click', QB.player.toggle);
    d.querySelector('[data-k=next]').addEventListener('click', () => QB.player.jump(rec.idx + 1));
    d.querySelector('[data-k=prev]').addEventListener('click', () => QB.player.jump(rec.idx - 1));
    d.querySelector('[data-k=close]').addEventListener('click', QB.player.stop);
    d.querySelector('[data-k=speed]').addEventListener('click', () => { const s = [0.75, 1, 1.25, 1.5]; QB.set('speed', s[(s.indexOf(QB.state.speed) + 1) % s.length]); if (rec.audio) rec.audio.playbackRate = QB.state.speed; renderDock(); });
    d.querySelector('[data-k=repeat]').addEventListener('click', () => { const r = ['off', 'ayah', 'range']; QB.set('repeat', r[(r.indexOf(QB.state.repeat) + 1) % r.length]); renderDock(); });
    d.querySelector('[data-k=reciter]').addEventListener('click', () => QB.sheet({ title: 'القارئ', render: (b, close) => {
      b.innerHTML = `<ul class="list">${QB.data.reciters.map((r) => `<li><button class="row" data-r="${r.id}"><span class="avatar">${r.name[0]}</span><span class="t">${r.name}<small dir="ltr" style="text-align:right">${r.en}, ${r.style === 'murattal' ? 'مرتّل' : r.style || ''}</small></span>${r.id === QB.state.reciter ? `<span class="pill gold">${QB.ico('check', 'sm')}المختار</span>` : ''}</button></li>`).join('')}</ul>`;
      b.querySelectorAll('[data-r]').forEach((x) => x.addEventListener('click', () => { QB.set('reciter', x.dataset.r); close(); if (rec.on) { renderDock(); if (rec.playing) playAyah(); } }));
    } }));
    paint();
  }
  function paint() {
    const cur = rec.list[rec.idx];
    QB.emit('rec', rec.on ? { on: true, s: cur.s, a: cur.a, word: rec.word } : { on: false });
    if (!rec.on) return;
    const d = QB.$('#dock');
    d.querySelector('[data-k=ref]').textContent = `${QB.surah(cur.s).name}، الآية ${QB.n(cur.a)}`;
    const play = d.querySelector('[data-k=play]');
    play.innerHTML = QB.ico(rec.playing ? 'pause' : 'play');
    play.setAttribute('aria-label', rec.playing ? 'إيقاف مؤقت' : 'تشغيل');
    d.querySelectorAll('.seg span').forEach((s, i) => { s.className = i < rec.idx ? 'done' : i === rec.idx ? 'cur' : ''; s.style.setProperty('--p', i === rec.idx ? rec.p : 0); });
    d.querySelector('[data-k=note]').textContent = rec.silent ? 'بلا صوت في هذه المعاينة؛ توقيت الكلمات تقريبي' : 'توقيت الكلمات تقريبي في النموذج';
  }
  function pause() { rec.playing = false; if (rec.audio) rec.audio.pause(); clearTimeout(rec.timer); if (rec.on) paint(); }
  function advance() {
    if (QB.state.repeat === 'ayah') { rec.word = -1; rec.p = 0; playAyah(); return; }
    if (rec.idx < rec.list.length - 1) { rec.idx += 1; rec.word = -1; rec.p = 0; playAyah(); return; }
    if (QB.state.repeat === 'range') { rec.idx = 0; rec.word = -1; rec.p = 0; playAyah(); return; }
    rec.playing = false; rec.p = 1; paint();
  }
  function playAyah(resume) {
    clearTimeout(rec.timer);
    const a = rec.list[rec.idx];
    const n = QB.words(a.text).length;
    const key = `${QB.state.reciter}:${a.s}:${a.a}`;
    let au = rec.audio;
    if (!resume || !au || au.dataset.k !== key) {
      if (au) au.pause();
      au = new Audio(`${reciter().audio}/${String(a.s).padStart(3, '0')}${String(a.a).padStart(3, '0')}.mp3`);
      au.dataset.k = key;
      au.playbackRate = QB.state.speed;
      rec.audio = au;
      au.addEventListener('error', () => { rec.silent = true; });
    }
    const pr = au.play(); if (pr && pr.catch) pr.catch(() => { rec.silent = true; });
    const fakeDur = (0.75 * n) / QB.state.speed;
    const start = performance.now() - rec.p * fakeDur * 1000;
    const tick = () => {
      if (!rec.playing || rec.audio !== au) return;
      const real = !rec.silent && au.duration && isFinite(au.duration) && !au.paused;
      rec.p = Math.min(1, real ? au.currentTime / au.duration : (performance.now() - start) / (fakeDur * 1000));
      rec.word = Math.min(n - 1, Math.floor(rec.p * n));
      paint();
      if (rec.p >= 1 || au.ended) { advance(); return; }
      rec.timer = setTimeout(tick, 60);
    };
    paint();
    rec.timer = setTimeout(tick, 60);
  }

  /* ---------------- Boot ---------------- */
  QB.boot = () => {
    // Test hooks: ?theme=light|dark, ?guest=1, ?signedout=1 (local preview and screenshots).
    const q = new URLSearchParams(location.search);
    if (q.get('theme')) QB.state.theme = q.get('theme');
    if (q.get('guest')) QB.state.user = { guest: true };
    if (q.get('signedout')) QB.state.user = null;
    applyTheme();
    renderRail();
    wireCommand();
    QB.$('#scrim').addEventListener('click', QB.closeOverlays);
    const start = (location.hash || '').slice(1);
    QB.go(screens[start] ? start : 'home');
    requestAnimationFrame(() => document.body.classList.add('drawn'));
  };
})();
