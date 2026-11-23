// Captures crisp stills of the live site for the demo video. Read-only: no sign-in, no votes,
// and view/analytics beacons are blocked so the capture does not inflate counts.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const BASE = 'https://digivated.com';
const OUT = 'demo-capture';
await fs.mkdir(OUT, { recursive: true });
const meta = {};
const browser = await chromium.launch();

async function context(opts) {
  const ctx = await browser.newContext({ colorScheme: 'light', reducedMotion: 'reduce', ...opts });
  await ctx.route(/\/api\/(project-views|site-activity|visitors)|_vercel\/insights|google-analytics|googletagmanager|sentry/, r => r.abort());
  return ctx;
}
async function settle(page, ms = 1500) {
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForTimeout(ms);
}
async function box(page, sel) {
  const el = page.locator(sel).first();
  if (!(await el.count())) return null;
  const b = await el.boundingBox();
  const sy = await page.evaluate(() => scrollY);
  return b && { x: b.x, y: b.y + sy, w: b.width, h: b.height };
}
async function shoot(page, name, extra = {}) {
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 92, fullPage: true });
  meta[name] = { width: page.viewportSize().width, ...extra };
}

// ---- Desktop ----
const desk = await context({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await desk.newPage();

await page.goto(BASE + '/');
await page.waitForSelector('.dg-row', { timeout: 30000 });
await settle(page, 2500);
const stats = await page.evaluate(() => [...document.querySelectorAll('#main *')].filter(e => /visits|Products/i.test(e.textContent) && e.children.length < 4).slice(0, 6).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
const firstProject = await page.locator('.dg-row h3 a').first().getAttribute('href');
const rows = await page.$$eval('.dg-row', els => els.slice(0, 8).map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height, name: e.querySelector('h3')?.textContent.trim() }; }));
await shoot(page, 'home', {
  stats, firstProject, rows,
  hero: await box(page, '#main h1'), search: await box(page, '#main input[type=search], #main input'),
  vote: await box(page, '.dg-row .dg-vote'), visit: await box(page, '.dg-row .dg-visit'), comments: await box(page, '.dg-row .dg-comments'),
  sidebar: await box(page, '.dg-workspace-rail, aside'), sections: await page.$$eval('#main h2', hs => hs.map(h => { const r = h.getBoundingClientRect(); return { t: h.textContent.trim(), y: r.y + scrollY }; })),
});
// Hover state on the first row's upvote (no click).
await page.evaluate(() => scrollTo(0, 0));
const vote = page.locator('.dg-row .dg-vote').first();
await vote.scrollIntoViewIfNeeded();
await page.evaluate(() => scrollTo(0, 0));
await vote.hover(); await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/home-hover-vote.jpg`, type: 'jpeg', quality: 92 });
meta['home-hover-vote'] = { vote: await box(page, '.dg-row .dg-vote') };
await page.mouse.move(5, 5);

for (const [name, path, waitFor] of [
  ['discover', '/discover', '.dg-row, [class*=dir] li'],
  ['categories', '/categories', 'main a'],
  ['news', '/news', 'main article, main li'],
  ['threads', '/threads', 'main'],
  ['tools', '/tools', 'main'],
  ['new-launch', '/new-launch', 'main'],
  ['shop', '/shop', 'main'],
  ['badges', '/badges', 'main'],
]) {
  try {
    await page.goto(BASE + path);
    await page.waitForSelector(waitFor, { timeout: 20000 }).catch(() => {});
    await settle(page, 2000);
    await shoot(page, name, { h1: await box(page, '#main h1'), sections: await page.$$eval('#main h2', hs => hs.map(h => { const r = h.getBoundingClientRect(); return { t: h.textContent.trim(), y: r.y + scrollY }; })) });
  } catch (e) { meta[name] = { error: String(e).slice(0, 200) }; }
}

// Typing in the directory search, one still per keystroke.
try {
  await page.goto(BASE + '/discover');
  await page.waitForSelector('.dg-row, [class*=dir] li', { timeout: 20000 }).catch(() => {});
  await settle(page, 1500);
  const input = page.locator('#main input[type=search], #main input').first();
  meta.typing = { input: await box(page, '#main input[type=search], #main input'), frames: [] };
  await input.click();
  await page.screenshot({ path: `${OUT}/type-00.jpg`, type: 'jpeg', quality: 92 });
  const q = 'video';
  for (let i = 1; i <= q.length; i++) {
    await input.pressSequentially(q[i - 1]);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/type-${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 92 });
    meta.typing.frames.push(q.slice(0, i));
  }
} catch (e) { meta.typing = { error: String(e).slice(0, 200) }; }

// Project page.
if (firstProject) {
  await page.goto(BASE + firstProject);
  await settle(page, 2500);
  await shoot(page, 'project', { h1: await box(page, '#main h1'), nav: await box(page, '.launch-section-nav'), feedback: await box(page, '#feedback'), vote: await box(page, '#main .dg-vote, #main [class*=vote]') });
}
await desk.close();

// ---- Mobile ----
const mob = await context({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const m = await mob.newPage();
for (const [name, path] of [['m-home', '/'], ['m-project', firstProject || '/discover'], ['m-news', '/news']]) {
  try {
    await m.goto(BASE + path);
    if (name === 'm-home') await m.waitForSelector('.dg-row', { timeout: 30000 }).catch(() => {});
    await settle(m, 2500);
    await shoot(m, name);
  } catch (e) { meta[name] = { error: String(e).slice(0, 200) }; }
}
await mob.close();

// Brand assets.
const req = await (await context({})).request;
for (const f of ['/digivated-daylight-mark.png', '/digivated-ascii-icon-transparent.png', '/digivated-social-card-v3.png', '/favicon.svg', '/apple-touch-icon.png']) {
  try { const r = await req.get(BASE + f); if (r.ok()) await fs.writeFile(`${OUT}/asset${f.replace(/\//g, '-')}`, await r.body()); } catch {}
}
await fs.writeFile(`${OUT}/meta.json`, JSON.stringify(meta, null, 2));
await browser.close();
console.log(JSON.stringify(meta, null, 1).slice(0, 3000));
