/* Menu backdrop preview: dismisses the tap-to-begin splash, then shots the menu.
   Runs N times so the random per-load zone variety is visible.
   Usage: node scripts/menushot.mjs <port> <count> */
import { chromium } from 'playwright';

const port = process.argv[2] || '5174';
const count = parseInt(process.argv[3] || '4', 10);
const url = `http://localhost:${port}/`;

const browser = await chromium.launch();
for (let i = 0; i < count; i++) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.mouse.click(206, 446);   // first click is eaten by the splash gate -> menu
  await page.waitForTimeout(1200);    // let the backdrop drift a touch + music settle
  const out = `/tmp/menu-${i}.png`;
  await page.screenshot({ path: out });
  console.log('saved', out, errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no console errors');
  await ctx.close();
}
await browser.close();
