import { z } from "zod";
import { sendEnquiry } from "../../../../../lib/agent/enquiry";

/**
 * POST { firmId, consents } -> { enquiry } (D45). The send gate is checked first, on the server: nothing is sent
 * unless ALLOW_REAL_SEND=1 and the patient is not a demo persona. Only the consent texts listed are ticked.
 */
export async function POST(req: Request) {
  const parsed = z.object({ firmId: z.string().min(1), consents: z.array(z.string()).max(20) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  try {
    return Response.json({ enquiry: await sendEnquiry(parsed.data.firmId, parsed.data.consents) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.split("\n")[0] : String(e) }, { status: 500 });
  }
}
