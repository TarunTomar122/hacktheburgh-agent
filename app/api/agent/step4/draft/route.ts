import { z } from "zod";
import { draftEnquiry } from "../../../../../lib/agent/enquiry";
import { CaseFacts } from "../../../../../lib/agent/facts";

/** POST { facts, legalAid? } -> EnquiryMessage. Facts only; no claim of negligence; the user can edit it. */
export async function POST(req: Request) {
  const parsed = z
    .object({ facts: CaseFacts, legalAid: z.object({ verdict: z.enum(["likely", "unlikely", "unknown", "skipped"]), route: z.enum(["legal_aid", "no_win_no_fee"]) }).optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  try {
    return Response.json(await draftEnquiry(parsed.data.facts, parsed.data.legalAid));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
