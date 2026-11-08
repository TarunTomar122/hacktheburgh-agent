import { z } from "zod";
import { editEnquiry } from "../../../../../lib/agent/enquiry";

/**
 * POST { firmId, edits } -> { enquiry }. The agent types the user's edits into the open form and reports how it
 * looks now. This never sends anything: sending is /api/agent/step4/send, behind the send gate.
 */
const Edit = z.object({ name: z.string().max(200), label: z.string().min(1).max(300), value: z.string().max(6000) });
export async function POST(req: Request) {
  const parsed = z.object({ firmId: z.string().min(1).max(100), edits: z.array(Edit).max(40) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  try {
    return Response.json({ enquiry: await editEnquiry(parsed.data.firmId, parsed.data.edits) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.split("\n")[0] : String(e) }, { status: 500 });
  }
}
