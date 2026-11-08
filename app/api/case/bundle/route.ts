import { z } from "zod";
import type { Profile } from "../../../../lib/profile";
import { bundleName, renderBundlePdf } from "../../../../lib/caseBundle/render";

/**
 * POST { profile } (the case, as the browser holds it) -> application/pdf: the solicitor-ready case bundle.
 * The case lives in the browser, so it comes in the body. Built only from what the profile holds; nothing is looked up and no
 * crew run starts. The proxy already refuses a signed-out caller with 401 when accounts are on.
 */

const MAX_BYTES = 3_000_000;
const Body = z.object({ profile: z.object({ facts: z.record(z.string(), z.unknown()) }).passthrough() });

export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (text.length > MAX_BYTES) return Response.json({ error: "This case is too large to turn into a PDF." }, { status: 413 });
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // answered below as a bad request
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Send the case as { profile }." }, { status: 400 });
  const profile = parsed.data.profile as unknown as Profile;
  try {
    const pdf = await renderBundlePdf(profile, new Date());
    const file = `case-bundle-${bundleName(profile).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "patient"}.pdf`;
    return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${file}"`, "cache-control": "no-store" } });
  } catch (e) {
    console.error("[api/case/bundle]", e instanceof Error ? e.message : e);
    return Response.json({ error: "The PDF could not be made just now. Try again in a moment." }, { status: 500 });
  }
}
