/* Verify the scores screen + lifetime footer. Seeds localStorage so there's
   data to render, then opens SCORES from the menu. */
import { chromium } from 'playwright';
const port = process.argv[2] || '5174';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.addInitScript(() => {
  localStorage.setItem('veil_lifetime', JSON.stringify({ runs: 12, caches: 87, bestChain: 9, bestLevel: 14 }));
  localStorage.setItem('veil_scores', JSON.stringify([
    { score: 48210, level: 14, date: '2026-06-18' },
    { score: 31050, level: 11, date: '2026-06-17', daily: true },
    { score: 22400, level: 8, date: '2026-06-16' },
  ]));
});
await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.mouse.click(206, 420);   // dismiss splash
await page.waitForTimeout(400);
await page.mouse.click(276, 616);   // SCORES (right button, secondary row)
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/scores.png' });
await browser.close();
console.log('saved /tmp/scores.png', errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no console errors');
