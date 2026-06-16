/* Screenshot helper for visual iteration.
   Usage: node scripts/shot.mjs <out.png> [menu|play|play:<level>]
   Requires the dev server running (npm run dev) at :5173. */
import { chromium } from 'playwright';

const out = process.argv[2] || '/tmp/veil-menu.png';
const action = process.argv[3] || 'menu';
const url = 'http://localhost:5173/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000); // let the pixel font + menu settle

if (action.startsWith('play')) {
  await page.mouse.click(206, 446);       // start a normal run (canvas mousedown)
  await page.waitForTimeout(400);
  const m = action.match(/play:(\d+)/);
  if (m) { await page.keyboard.press(m[1]); await page.waitForTimeout(400); }  // dev level jump
  await page.keyboard.press('ArrowDown');  // nudge into a draw so there's something to see
  await page.waitForTimeout(700);
}

await page.screenshot({ path: out });
await browser.close();
console.log('saved', out);
