// OPTIONAL runner: fresh-profile launch stalled on the HOST-00 host; NOT acceptance evidence.
// Recorded acceptance used native CUA browser input instead. See README.md.
// Trusted browser input via Playwright; no DOM click(), autoplay flags or production access.
import { chromium } from '../../music/node_modules/playwright-core/index.mjs';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false });
const context = await browser.newContext();
const network = [], errors = [], results = [];
await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.hostname !== '127.0.0.1' || url.port !== '5199') { network.push(url.href); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(String(error)));
const base = 'http://127.0.0.1:5199';
const snapshot = () => page.evaluate(() => HOST00.snapshot());
const waitChild = () => page.frameLocator('#surface').locator('#on').waitFor();
const sample = async name => { const value = await snapshot(); results.push({ name, ...value }); return value; };
try {
  await page.goto(base + '/wall-app/'); await waitChild();
  await page.frameLocator('#surface').locator('#on').click();
  await page.waitForFunction(() => HOST00.snapshot().events.some(e => e.type === 'readiness'), null, { timeout: 15000 });
  await page.waitForTimeout(700); await sample('activation-immediate');
  for (const button of ['#book','#map','#book','#map','#child-reload']) {
    await page.locator(button).click(); await waitChild(); await page.waitForTimeout(500); await sample('continuity-' + button);
  }
  await page.locator('#off').click(); await sample('off');
  // New document removes the earlier activation history for delayed test.
  await page.reload(); await waitChild();
  await page.frameLocator('#surface').locator('#slow').click();
  await page.waitForFunction(() => HOST00.snapshot().events.some(e => e.type === 'readiness'), null, { timeout: 18000 });
  await sample('activation-delayed-6s');
  await page.locator('#off').click();
  await page.reload(); await waitChild(); await sample('history-initial');
  await page.locator('#book').click(); await waitChild();
  await page.frameLocator('#surface').locator('#a').click();
  await page.frameLocator('#surface').locator('#b').click(); await sample('artwork-B');
  await page.locator('#map').click(); await waitChild(); await sample('history-map-final');
  await page.goBack(); await waitChild(); await page.waitForTimeout(250); await sample('back-book-B');
  await page.goBack(); await waitChild(); await page.waitForTimeout(250); await sample('back-map-initial');
  await page.goForward(); await waitChild(); await page.waitForTimeout(250); await sample('forward-book-B');
  await page.reload(); await waitChild(); await sample('reload-book-B');
  const newPagePromise = context.waitForEvent('page');
  await page.locator('#canonical').click(); const newPage = await newPagePromise;
  await newPage.waitForFunction(() => window.HOST00 && document.querySelector('#surface').contentWindow.location.search.includes('artwork=B'));
  results.push({ name: 'new-tab-book-B', ...await newPage.evaluate(() => HOST00.snapshot()) });
  await newPage.close(); await page.bringToFront();
  // Focus: browser pointer + keyboard, then Tab out to parent link.
  await page.frameLocator('#surface').locator('#input').click(); await page.keyboard.type('HOST00');
  await page.keyboard.press('Tab');
  results.push({ name: 'focus-tab-within', childActive: await page.frameLocator('#surface').locator('#last').evaluate(e => e === document.activeElement) });
  await page.keyboard.press('Tab'); await sample('focus-tab-out');
  results.push({ name: 'focus-state', parentActive: await page.evaluate(() => document.activeElement.tagName), input: await page.frameLocator('#surface').locator('#input').inputValue() });
  // Independent fixture pages isolate nested-history experiment from prior sequence.
  for (const [name, button] of [['src','#src'], ['child-anchor','#child-nav'], ['child-location-replace','#replace-nav'], ['child-replace-state','#child-replace']]) {
    await page.goto(base + '/wall-app/'); await waitChild();
    await page.locator('#book').click(); await waitChild();
    await sample(name + '-before');
    if (name === 'src') await page.locator(button).click(); else await page.frameLocator('#surface').locator(button).click();
    await waitChild(); await page.waitForTimeout(350); await sample(name + '-after');
    await page.goBack(); await waitChild(); await page.waitForTimeout(350); await sample(name + '-back-once');
  }
  await page.goto(base + '/blackbook.html?artwork=A'); await waitChild(); await sample('copied-direct-A');
  await page.goto(base + '/wall-app/'); await waitChild(); await sample('direct-map');
} catch (error) { errors.push(error.stack); }
await writeFile('/tmp/host-00-chromium.json', JSON.stringify({ browser: await browser.version(), platform: process.platform, networkBlocked: network, errors, results }, null, 2));
console.log(JSON.stringify({ browser: await browser.version(), errors, networkBlocked: network, samples: results.map(x => ({name:x.name,url:x.url,childUrl:x.childUrl,historyLength:x.historyLength,context:x.context,peak:x.peak,audio:x.audio,sessionId:x.sessionId,engineCount:x.engineCount,childActive:x.childActive,parentActive:x.parentActive,input:x.input})) }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
