import { dismissCookies, openSession } from "./browser";

export type Firm = {
  name: string;
  address: string;
  legalAid: boolean;
  partners: number | null;
};

export type DirectorySearch = { total: number | null; firms: Firm[] };

/** Search the Law Society of Scotland "Find a Solicitor" directory (firms). Submits nothing. */
export async function searchDirectory(opts: {
  location: string;
  areaOfLaw: string;
  limit?: number;
}): Promise<DirectorySearch> {
  const { browser, page } = await openSession();
  try {
    await page.goto("https://www.lawscot.org.uk/find-a-solicitor/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("input[name=FirmPostcode]");
    await dismissCookies(page);

    await page.fill("input[name=FirmPostcode]", opts.location);
    await page.selectOption("select[name=AreaOfLaw]", { label: opts.areaOfLaw });
    await page.waitForTimeout(1000); // let the sub-category widgets initialise
    await page.locator("form:visible button[type=submit]", { hasText: "Search" }).click();
    await page.waitForSelector(".find-a-solicitor-list-item", { timeout: 20000 });

    const bodyText = await page.locator("body").innerText();
    const totalMatch = bodyText.match(/(\d+)\s+results? found/i);

    const firms = await page.$$eval(
      ".find-a-solicitor-list-item",
      (items, limit) =>
        items.slice(0, limit).map((el) => {
          const summary = el.querySelector(".findASolSummary");
          const text = summary?.textContent ?? "";
          const partners = text.match(/Total Partners:\s*(\d+)/i);
          return {
            name: (el.querySelector("h2")?.textContent ?? "").trim(),
            address: (el.querySelector(".findASolSummary p")?.textContent ?? "").trim().split(/\s*[\r\n]+\s*/).join(", "),
            legalAid: /legal aid/i.test(text),
            partners: partners ? Number(partners[1]) : null,
          };
        }),
      opts.limit ?? 10,
    );

    if (!process.env.HEADLESS) await page.waitForTimeout(3000); // leave results visible
    return { total: totalMatch ? Number(totalMatch[1]) : null, firms };
  } finally {
    await browser.close();
  }
}
