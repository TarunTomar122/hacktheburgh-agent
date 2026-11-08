/**
 * Read a page without a browser (night plan: "fetch first, browser only when the page needs it").
 * A plain HTTP fetch is enough for most official pages and PDFs. It declines (returns null) whenever the page might need
 * a real browser: a bot check, a login, a JavaScript app that renders nothing without scripts, an error, a page too thin to
 * read. The caller then opens the browser as before, so nothing is lost and nothing is claimed that was not read.
 */

export type QuickPage = { kind: "html"; url: string; title: string; text: string; links: { text: string; url: string }[]; /** the page carries a form a person can write in (or an embedded form tool) */ form: boolean } | { kind: "pdf"; url: string; buf: Buffer };

/** Form tools that are embedded with a script: the form itself only appears in a browser, but the page clearly has one. */
const EMBEDDED_FORM = /hbspt\.forms|hsforms\.(net|com)|wpcf7|gform_wrapper|gravityforms|typeform\.com|jotform|formstack|cognitoforms|ninja-forms|wpforms|forms\.office\.com|<iframe[^>]+(form|enquir)/i;

const BLOCKED =
  /verify(ing)? (that )?you are (a )?human|checking (if the site connection is secure|your browser)|just a moment\.\.\.|making sure you('|’)?re not a bot|ddos protection by|press (and|&) hold|are you a robot|unusual traffic from your|captcha|enable javascript|javascript (is )?(required|disabled)|you need to enable javascript|please turn on javascript/i;

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", pound: "£", euro: "€", copy: "©", hellip: "…" };
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => entities[n.toLowerCase()] ?? m);

const strip = (html: string) =>
  decode(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/table|\/ul|\/ol)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

/** Fetch one page; null means "use the browser". */
export async function quickFetch(url: string): Promise<QuickPage | null> {
  return (await quickFetchWhy(url)).page;
}

/** Fetch one page, and when the browser is needed, say why (shown on the browser-use dashboard). */
export async function quickFetchWhy(url: string): Promise<{ page: QuickPage | null; reason: string }> {
  const no = (reason: string) => ({ page: null, reason });
  if (process.env.QUICK_READ === "0") return no("plain fetching is switched off");
  if (!/^https?:/i.test(url)) return no("not a web address");
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5", "accept-language": "en-GB,en;q=0.9" },
    });
    if (res.status !== 200) return no(res.status === 403 || res.status === 429 || res.status === 503 ? `the site refused a plain request (${res.status}), a bot check` : `the site answered ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    const finalUrl = res.url || url;
    if (/application\/pdf/i.test(type) || /\.pdf($|[?#])/i.test(finalUrl)) {
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.subarray(0, 5).toString("latin1") === "%PDF-" && buf.length < 25_000_000 ? { page: { kind: "pdf", url: finalUrl, buf }, reason: "a PDF" } : no("a PDF that could not be read directly");
    }
    if (!/text\/html|application\/xhtml/i.test(type)) return no(`not a web page (${type.split(";")[0] || "unknown type"})`);
    const html = await res.text();
    if (/<input[^>]+type=["']?password/i.test(html)) return no("a login page"); // the browser (and the hand-off) deal with it
    const text = strip(html);
    if (BLOCKED.test(text.slice(0, 4000)) && text.length < 6000) return no("a bot check or 'enable JavaScript' wall");
    if (text.length < 1500) return no("the page is built by scripts (almost no text without a browser)");
    if (text.length < html.length / 60) return no("the page is built by scripts (mostly code, little text)");
    const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
    const links: { text: string; url: string }[] = [];
    const seen = new Set<string>();
    for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      let u: string;
      try {
        u = new URL(decode(m[1]), finalUrl).href;
      } catch {
        continue;
      }
      const t = strip(m[2]).replace(/\s+/g, " ").slice(0, 80);
      if (!/^https?:/.test(u) || t.length < 2 || seen.has(u)) continue;
      seen.add(u);
      links.push({ text: t, url: u });
      if (links.length >= 200) break;
    }
    const form = (/<form\b/i.test(html) && /<textarea\b|type=["']?email/i.test(html)) || EMBEDDED_FORM.test(html);
    return { page: { kind: "html", url: finalUrl, title, text, links, form }, reason: "a plain page" };
  } catch (e) {
    return no(e instanceof Error && /timeout|abort/i.test(e.name + e.message) ? "the site was too slow for a plain request" : "a plain request failed (network or certificate)");
  }
}
