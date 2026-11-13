#!/usr/bin/env node
/**
 * Third-party request audit (docs/privacy-fonts.md): loads every public page and
 * the app's main screens in nine interface languages, on desktop and phone sizes
 * (and once more with the self-hosted Noto fonts blocked), records every network
 * request, and fails if any reaches fonts.googleapis.com or fonts.gstatic.com.
 * It also lists every third-party host contacted.
 *
 *   BASE=http://127.0.0.1:3000 node scripts/audit-third-party-requests.mjs
 *   LOCALES=ar,ja node scripts/audit-third-party-requests.mjs   (a quicker pass)
 *
 * Needs a running web app (and API), and Playwright (not a project dependency:
 * point PLAYWRIGHT_MODULE at an installed copy if it isn't resolvable).
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = (process.env.BASE || 'http://127.0.0.1:3000').replace(/\/$/, '');
const LOCALES = process.env.LOCALES ? process.env.LOCALES.split(',') : ['ar', 'en', 'ja', 'hi', 'ko', 'ur', 'bn', 'zh', 'ru'];
const PUBLIC = ['/about', '/guide', '/guide?on=web', '/faq', '/guidelines', '/login', '/welcome'];
const APP = ['/', '/?mode=reading', '/?mode=search&q=%D8%B5%D8%A8%D8%B1', '/?mode=settings', '/?mode=notebook', '/?mode=community'];
const GOOGLE = /fonts\.(googleapis|gstatic)\.com/;
await (async () => {
  const browser = await chromium.launch();
  const hits = []; const thirdParty = new Map(); let total = 0, pages = 0;
  for (const [label, opts, blockLocal] of [['desktop', { viewport: { width: 1440, height: 900 } }, false], ['phone', devices['iPhone 13'], false], ['phone, local fonts blocked', devices['iPhone 13'], true]]) {
    for (const locale of (blockLocal ? ['ja', 'hi', 'ko'] : LOCALES)) {
      for (const [guest, paths] of [[false, PUBLIC], [true, APP]]) {
        const ctx = await browser.newContext({ ...opts, locale, colorScheme: 'dark' });
        await ctx.addInitScript(([l, g]) => { try { localStorage.setItem('qb.locale', l); if (g) { localStorage.setItem('qb.guest', '1'); sessionStorage.setItem('qb.landed', '1'); } } catch {} }, [locale, guest]);
        if (blockLocal) await ctx.route(/\/fonts\/noto\//, (r) => r.abort());
        const page = await ctx.newPage();
        page.on('request', (req) => {
          total++;
          const u = new URL(req.url());
          if (GOOGLE.test(u.host)) hits.push(`${label} ${locale} ${page.url()} -> ${req.url()}`);
          if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(u.host) && u.protocol.startsWith('http')) thirdParty.set(u.host, (thirdParty.get(u.host) || 0) + 1);
        });
        for (const p of paths) {
          try {
            await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 90000 });
            await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } });
            await page.waitForTimeout(800);
            pages++;
          } catch (e) { console.log('load failed', label, locale, p, e.message.split('\n')[0]); }
        }
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(`page loads: ${pages}, requests: ${total}`);
  console.log(`requests to fonts.googleapis.com / fonts.gstatic.com: ${hits.length}`);
  hits.slice(0, 20).forEach((h) => console.log('  ', h));
  console.log('third-party hosts contacted:', thirdParty.size ? [...thirdParty].map(([h, n]) => `${h} (${n})`).join(', ') : 'none');
  process.exit(hits.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
