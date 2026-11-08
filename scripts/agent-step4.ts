// Step 4 from the CLI: draft the message, find and fill 3 firms' enquiry forms, then try to send one.
// Uses the fictional compensation persona (example.com email), so the send gate ALWAYS refuses: nothing reaches a firm.
// Usage: HEADLESS=1 npm run agent:step4
process.env.HANDOFF_WAIT_MS ??= "0";
import { draftEnquiry, runEnquiries, sendEnquiry } from "../lib/agent/enquiry";
import type { FirmFinding } from "../lib/agent/legalAidTypes";
import { DEMO_PERSONAS } from "../lib/agent/sample";

const firm = (f: Partial<FirmFinding> & Pick<FirmFinding, "id" | "name" | "town">): FirmFinding => ({
  distanceMiles: null, website: null, email: null, phone: null, sources: ["slab"], legalAid: true, activeRecently: true,
  actsForPatients: "unknown", noWinNoFee: "unknown", enquiryUrl: null, score: 0, reasons: [], excluded: null, ...f,
});

// Three forms verified earlier: on-page form; form in a popup; form on /contact-us found from the home page.
const FIRMS: FirmFinding[] = [
  firm({ id: "anderson-strathern", name: "Anderson Strathern", town: "Edinburgh", website: "https://www.andersonstrathern.co.uk/", enquiryUrl: "https://www.andersonstrathern.co.uk/legal-expertise/medical-negligence/" }),
  firm({ id: "mfmac", name: "MFMac", town: "Glasgow", website: "https://mfmac.com/legal-expertise/individuals-and-families/personal-injury/medical-negligence-compensation", email: "enquiries@mfmac.com" }),
  firm({ id: "irwin-mitchell", name: "Irwin Mitchell", town: "Glasgow", website: "https://www.irwinmitchell.com/" }),
];

async function main() {
  const persona = DEMO_PERSONAS.find((p) => p.id === "compensation")!;
  const message = await draftEnquiry(persona.facts, { verdict: "likely", route: "legal_aid" });
  console.log(`\nSUBJECT: ${message.subject}\n${message.body}\n`);
  const result = await runEnquiries(
    { facts: persona.facts, message, firms: FIRMS, legalAid: { verdict: "likely", route: "legal_aid" } },
    {
      keepOpen: true,
      onEvent: (e) => {
        if (e.type === "trace") console.log(`  [${e.step.agent}] ${e.step.kind}: ${e.step.text}`);
        else if (e.type === "enquiry") console.log(`ENQUIRY ${e.enquiry.firmName}: ${e.enquiry.status} - ${e.enquiry.note}`);
      },
    },
  );
  for (const o of result.enquiries) {
    console.log(`\n== ${o.firmName}: ${o.status} | form ${o.formUrl ?? "-"}`);
    for (const f of o.filled) console.log(`   filled  ${f.label}: ${f.value.slice(0, 70).replace(/\n/g, " ")}`);
    for (const c of o.consents) console.log(`   consent ${c.slice(0, 110)}`);
    for (const u of o.unfilled) console.log(`   missing ${u}`);
    if (o.email) console.log(`   email to ${o.email.to}`);
  }
  const ready = result.enquiries.find((o) => o.status === "ready_to_send");
  if (ready) {
    const sent = await sendEnquiry(ready.firmId, ready.consents);
    console.log(`\nSEND ${ready.firmName}: ${sent.status} - ${sent.note}`);
  }
  console.log(`\nstats ${JSON.stringify(result.stats)} | trace ${result.trace.length} steps | run ${result.runId}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
