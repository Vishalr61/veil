/* Trigger a real capture and screenshot the juice (spark burst + popups).
   Player starts at the top border; draw down, across, back up to close a loop. */
import { chromium } from 'playwright';
const port = process.argv[2] || '5174';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.mouse.click(206, 420);   // dismiss splash
await page.waitForTimeout(400);
await page.mouse.click(206, 546);   // PLAY
await page.waitForTimeout(700);
// draw a loop off the top border
await page.keyboard.press('ArrowDown'); await page.waitForTimeout(650);
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(550);
await page.keyboard.press('ArrowUp'); await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/cap-burst.png' });   // mid-capture: burst + slow-mo
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/cap-after.png' });
await browser.close();
console.log('saved /tmp/cap-burst.png + /tmp/cap-after.png', errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no console errors');
