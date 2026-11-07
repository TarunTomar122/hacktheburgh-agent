// Visit each URL headless and report: final URL, title, forms/fields, iframes, CAPTCHA signals.
// Never submits anything.
import { chromium } from 'playwright';

const urls = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'en-GB', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' });

for (const url of urls) {
  const page = await ctx.newPage();
  const out = { url };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    out.status = resp?.status();
    out.final = page.url();
    out.title = await page.title();
    const html = await page.content();
    out.captcha = ['recaptcha', 'hcaptcha', 'turnstile', 'cf-challenge', 'captcha', 'friendlycaptcha']
      .filter((k) => html.toLowerCase().includes(k));
    out.blocked = /access denied|are you a robot|verify you are human|just a moment/i.test(html);
    out.forms = await page.$$eval('form', (fs) =>
      fs.map((f) => ({
        action: f.getAttribute('action'),
        fields: [...f.querySelectorAll('input:not([type=hidden]),select,textarea')].length,
        types: [...new Set([...f.querySelectorAll('input:not([type=hidden]),select,textarea')].map((e) => e.type || e.tagName))].join(','),
      })).filter((f) => f.fields > 0));
    out.iframes = await page.$$eval('iframe', (fs) => fs.map((f) => f.src).filter(Boolean).slice(0, 6));
    out.links = await page.$$eval('a', (as) =>
      as.filter((a) => /form|estimat|calculat|enquir|contact|feedback|complain|claim/i.test(a.textContent + a.href))
        .map((a) => `${a.textContent.trim().slice(0, 50)} -> ${a.href}`).slice(0, 12));
  } catch (e) {
    out.error = e.message.split('\n')[0];
  }
  console.log(JSON.stringify(out, null, 2));
  await page.close();
}
await browser.close();
