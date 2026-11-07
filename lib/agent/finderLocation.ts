import type { Page } from "playwright";
import type { SearchLocation } from "./searchLocation";

/** Use SLAB's own manual lookup and verify its confirmation before trusting distances. */
export async function chooseFinderLocation(page: Page, location?: SearchLocation): Promise<string | undefined> {
  if (!location?.allowed) return undefined;
  await page.getByRole("link", { name: "Manually Choose Your Location", exact: true }).click();
  await page.getByPlaceholder("Enter a town or postcode", { exact: true }).fill(location.postcode);
  await page.locator("#select-customlocation").click();
  try {
    await page.waitForFunction((postcode) => {
      const valid = document.querySelector("#manualUserLocationCurrentIsValid")?.textContent?.trim() === "1";
      const text = document.querySelector("#user-location-message")?.textContent?.replace(/\s/g, "").toUpperCase() ?? "";
      return valid && text.includes("SCOTLAND") && text.includes(postcode.replace(/\s/g, "").toUpperCase());
    }, location.postcode, { timeout: 15000 });
  } catch {
    throw new Error(`SLAB could not confirm ${location.postcode} as a Scottish search location. Change the postcode or continue without location.`);
  }
  const close = page.getByRole("button", { name: "Close custom Location Options" });
  if (await close.isVisible()) await close.click();
  return location.postcode;
}
