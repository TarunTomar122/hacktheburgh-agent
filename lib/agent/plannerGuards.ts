import { MAX_ENQUIRIES } from "./enquiryTypes";
import type { FirmFinding } from "./legalAidTypes";
import type { SearchLocation } from "./searchLocation";

/** Reserve a fill attempt synchronously, before any model/browser await. */
export class EnquiryFillGuard {
  private attempts = 0;
  private active = new Set<string>();
  private ready = new Set<string>();

  claim(firm: FirmFinding | undefined, shortlist: string[]): string | null {
    if (!firm) return "Unknown firm id.";
    if (firm.excluded) return "This firm was excluded.";
    if (!shortlist.includes(firm.id)) return "Shortlist this firm before filling its form.";
    if (!firm.website && !firm.enquiryUrl) return "This firm has no website or enquiry form.";
    if (this.active.has(firm.id)) return "This firm's form is already being filled.";
    if (this.ready.has(firm.id)) return "This firm's form is already ready for review.";
    if (this.attempts >= MAX_ENQUIRIES) return `The limit of ${MAX_ENQUIRIES} form-filling attempts for this run has been reached.`;
    this.attempts++;
    this.active.add(firm.id);
    return null;
  }

  finish(id: string, ready: boolean) {
    this.active.delete(id);
    if (ready) this.ready.add(id);
  }
}

export function solicitorSummary(firms: FirmFinding[], location: SearchLocation): string {
  const summary = `Found ${firms.length} firms that take legal aid for medical negligence.`;
  if (!location.allowed) return `${summary} Distance ranking was not used because location was not shared.`;
  const nearest = firms.filter((f) => f.distanceOrigin === location.postcode && f.distanceMiles !== null)
    .sort((a, b) => a.distanceMiles! - b.distanceMiles!)[0];
  return nearest
    ? `${summary} Nearest to ${location.postcode}: ${nearest.name}, ${nearest.distanceMiles} miles.`
    : `${summary} No confirmed distances from ${location.postcode} were available.`;
}
