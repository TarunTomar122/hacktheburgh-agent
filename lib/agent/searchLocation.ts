import { z } from "zod";
import { formatPostcode, isPostcode } from "./inputs";

/** An approved postcode is the only patient location sent to the solicitor finder. */
export const SearchLocation = z.discriminatedUnion("allowed", [
  z.object({ allowed: z.literal(false) }),
  z.object({ allowed: z.literal(true), postcode: z.string().trim().refine(isPostcode, "Enter a valid UK postcode").transform(formatPostcode) }),
]);
export type SearchLocation = z.infer<typeof SearchLocation>;

type LocationQuestion = { question: string; why: string; kind: "yes_no" | "text" };
export async function askSearchLocation(ask: (question: LocationQuestion) => Promise<string | null>): Promise<SearchLocation> {
  const permission = await ask({ question: "May Elliot use your postcode to find solicitors near you?", why: "With your permission, Elliot shares the postcode you provide with SLAB's solicitor finder. You can continue without location.", kind: "yes_no" });
  if (permission?.trim().toLowerCase() !== "yes") return { allowed: false };
  while (true) {
    const postcode = await ask({ question: "What is the patient's postcode to search from?", why: "Use the patient's location, not the hospital's. This finder covers Scotland. Skip to continue without location.", kind: "text" });
    if (!postcode?.trim()) return { allowed: false };
    const parsed = SearchLocation.safeParse({ allowed: true, postcode });
    if (parsed.success) return parsed.data;
    const retry = await ask({ question: "That postcode is not valid. Would you like to try again?", why: "Choose No to search without location.", kind: "yes_no" });
    if (retry?.trim().toLowerCase() !== "yes") return { allowed: false };
  }
}
