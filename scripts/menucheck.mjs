/* Verify the menu no longer launches on a stray click/key.
   1) dismiss splash, 2) click empty space -> still menu, 3) press a letter ->
   still menu, 4) click PLAY -> game starts. Usage: node scripts/menucheck.mjs <port> */
import { chromium } from 'playwright';
const port = process.argv[2] || '5174';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.mouse.click(206, 420);   // first click eaten by splash gate -> menu
await page.waitForTimeout(500);
await page.mouse.click(206, 430);   // empty space between subtitle and PLAY
await page.keyboard.press('x');     // a stray letter
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/check-stray.png' });   // expect: still the VEIL menu
await page.mouse.click(206, 546);   // PLAY button
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/check-play.png' });    // expect: in-game HUD
await browser.close();
console.log('saved /tmp/check-stray.png + /tmp/check-play.png');
