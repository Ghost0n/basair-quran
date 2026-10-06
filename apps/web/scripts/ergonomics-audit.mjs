#!/usr/bin/env node
/**
 * Phone ergonomics audit (docs/mobile-ergonomics-prototype.md): for each main
 * screen, with the phone prototype off and on, counts the visible touch
 * targets, those under 44 and 24 CSS px, where they sit on the screen (bottom
 * half / top quarter) and the reader's share of the height.
 *
 *   BASE_URL=http://localhost:3000 node scripts/ergonomics-audit.mjs > audit.json
 *
 * Needs a running app and Playwright (not a project dependency: point
 * PLAYWRIGHT_MODULE at an installed copy if it isn't resolvable).
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SCREENS = [
  ['Home', '/'],
  ['Reader', '/?mode=reading'],
  ['Search (empty)', '/?mode=search'],
  ['Search results', '/?mode=search&q=%D8%B5%D8%A8%D8%B1'],
  ['Study', '/?mode=studio'],
  ['Index', '/?mode=index'],
  ['Notebook', '/?mode=notebook'],
];
const device = devices[process.env.DEVICE || 'iPhone 13'];
const out = {};
const browser = await chromium.launch();
for (const variant of ['current', 'prototype']) {
  const ctx = await browser.newContext({ ...device, colorScheme: 'dark' });
  await ctx.addInitScript(`try{sessionStorage.setItem('qb.landed','1'); ${variant==='prototype' ? "localStorage.setItem('qb.ux','m2')" : "localStorage.removeItem('qb.ux')"}}catch(e){}`);
  const page = await ctx.newPage();
  out[variant] = {};
  for (const [name, url] of SCREENS) {
    await page.goto(BASE_URL + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    out[variant][name] = await page.evaluate(() => {
      const W = innerWidth, H = innerHeight;
      const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=radio], [role=menuitem], [role=option]';
      const els = [...document.querySelectorAll(sel)].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        if (r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) return false;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || +cs.opacity === 0 || cs.pointerEvents === 'none') return false;
        if (el.closest('[inert], [aria-hidden="true"]')) return false;
        // Quran words and verse markers are reading content, not chrome.
        if (el.closest('.qb-glyph-page, .qb-mushaf-page, .qb-verse-row .vtext')) return false;
        // Something else covers its centre (e.g. a scrim): not reachable.
        const cx = Math.min(W - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
        const top = document.elementFromPoint(cx, cy);
        if (top && top !== el && !el.contains(top) && !top.contains(el)) return false;
        return true;
      });
      const items = els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), cy: r.top + r.height / 2, label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 30) };
      });
      const small44 = items.filter((i) => Math.min(i.w, i.h) < 44);
      const small24 = items.filter((i) => Math.min(i.w, i.h) < 24);
      const bottomHalf = items.filter((i) => i.cy > H / 2).length;
      const topQuarter = items.filter((i) => i.cy < H / 4).length;
      // Reading room: the page's share of the screen.
      const surface = document.querySelector('.qb-reader-surface');
      const page = document.querySelector('.qb-glyph-page, .qb-mushaf-page');
      return {
        targets: items.length,
        under44: small44.length,
        under24: small24.length,
        bottomHalf,
        topQuarter,
        surfacePct: surface ? Math.round((surface.getBoundingClientRect().height / H) * 100) : null,
        smallList: small44.map((i) => `${i.label || '?'} ${i.w}×${i.h}`),
      };
    });
  }
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
