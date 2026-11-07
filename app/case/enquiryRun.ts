import type { CaseFacts } from "../../lib/agent/facts";
import type { EnquiryMessage, EnquiryOutcome, FieldEdit, FormField, Step4Event, Step4Result } from "../../lib/agent/enquiryTypes";
import type { FirmFinding, Step3Result, TraceStep } from "../../lib/agent/legalAidTypes";
import { AGENT_COLORS } from "../../lib/agent/legalAidTypes";
import { fixtureMode } from "./legalAidRun";

/** Client side of step 4 (D45 contract): draft the message, fill the firms' forms, send one approved firm. `?fixture=1` = sample data. */

type LegalAidSummary = { verdict: Step3Result["verdict"]; route: Step3Result["route"] } | undefined;
const json = { "content-type": "application/json" };
const notReady = "The step 4 agents are not connected yet. Add ?fixture=1 to the address to see sample data.";

export async function draftMessage(facts: CaseFacts, legalAid: LegalAidSummary): Promise<EnquiryMessage> {
  if (fixtureMode()) return fixtureMessage(facts, legalAid);
  const r = await fetch("/api/agent/step4/draft", { method: "POST", headers: json, body: JSON.stringify({ facts, legalAid }) });
  if (r.status === 404) throw new Error(notReady);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "Could not write the message");
  return data as EnquiryMessage;
}

export async function runStep4(body: { facts: CaseFacts; message: EnquiryMessage; firms: FirmFinding[]; reserves?: FirmFinding[]; legalAid: LegalAidSummary }, onEvent: (e: Step4Event) => void): Promise<Step4Result> {
  if (fixtureMode()) return replay(body.firms, onEvent);
  const dropped = () => new Error("The connection to the app's server dropped (it may have restarted). Nothing was sent. Try again.");
  const res = await fetch("/api/agent/step4", { method: "POST", headers: json, body: JSON.stringify(body) }).catch(() => {
    throw dropped();
  });
  if (res.status === 404) throw new Error(notReady);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not start the agents");
  if (!res.body) throw new Error("The agents returned no progress stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let result: Step4Result | null = null;
  const receive = (line: string) => {
    if (!line.trim()) return;
    const e = JSON.parse(line) as Step4Event;
    if (e.type === "error") throw new Error(e.message);
    if (e.type === "result") result = e.result;
    onEvent(e);
  };
  try {
    while (true) {
      const { value, done } = await reader.read().catch(() => {
        throw dropped();
      });
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(receive);
      if (done) break;
    }
    receive(pending);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!result) throw new Error("The agents stopped before giving a result. You can try again.");
  return result;
}

/**
 * The fields to show in the review. Runs from before the form fields were recorded only have what was filled and what
 * was left empty, so build the list from those (the server then finds each field again by its label).
 */
export function fieldsOf(o: EnquiryOutcome): FormField[] {
  if (o.fields?.length) return o.fields;
  const long = (v: string) => v.length > 90 || v.includes("\n");
  return [
    ...o.unfilled.map((label): FormField => ({ name: "", label, value: "", kind: "text", required: true })),
    ...o.filled.map((f): FormField => ({ name: "", label: f.label.replace(/ \(the form's default.*$/, ""), value: f.value, kind: long(f.value) ? "textarea" : "text", required: false })),
  ];
}

/** Sample and recorded runs have no live form: apply the edits to the saved copy so the review still works. */
function editLocally(o: EnquiryOutcome, edits: FieldEdit[]): EnquiryOutcome {
  const fields = fieldsOf(o).map((f) => {
    const e = edits.find((x) => x.label === f.label && x.name === f.name);
    return e ? { ...f, value: e.value } : f;
  });
  const missing = fields.filter((f) => f.required && !f.value.trim()).map((f) => f.label);
  return {
    ...o,
    fields,
    filled: fields.filter((f) => f.value.trim()).map((f) => ({ label: f.label, value: f.value })),
    unfilled: missing,
    status: missing.length ? "needs_input" : "ready_to_send",
    question: missing.length ? `Their form still needs: ${missing.join(", ")}.` : undefined,
    note: missing.length ? `The form still needs ${missing.join(", ")}` : "Form filled and stopped before Send. Waiting for your approval",
  };
}

/** The agent types the user's edits into the firm's open form (never sends) and reports how it looks now. */
export async function editEnquiry(firmId: string, edits: FieldEdit[], current: EnquiryOutcome, local = false): Promise<EnquiryOutcome> {
  if (local || fixtureMode()) return editLocally(current, edits);
  const r = await fetch("/api/agent/step4/edit", { method: "POST", headers: json, body: JSON.stringify({ firmId, edits }) });
  if (r.status === 404) throw new Error(notReady);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "Could not change the form");
  return data.enquiry as EnquiryOutcome;
}

const SAMPLE_NOTE = "Not sent: this is sample or recorded data from a demo persona. We never send fictional enquiries to real firms.";

/** Ask the agent to press Send on one firm's filled form, after putting in the user's edits. Only the consents listed are ticked. */
export async function sendEnquiry(firmId: string, consents: string[], current: EnquiryOutcome, edits: FieldEdit[] = [], local = false): Promise<EnquiryOutcome> {
  if (local || fixtureMode()) return { ...(edits.length ? editLocally(current, edits) : current), status: "send_blocked", note: SAMPLE_NOTE };
  const r = await fetch("/api/agent/step4/send", { method: "POST", headers: json, body: JSON.stringify({ firmId, consents, edits }) });
  if (r.status === 404) throw new Error(notReady);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "Could not send");
  return data.enquiry as EnquiryOutcome;
}

/* ------------------------------------------------------------------ fixture (made up, for layout only) */

function fixtureMessage(f: CaseFacts, legalAid: LegalAidSummary): EnquiryMessage {
  const name = [f.firstName, f.lastName].filter(Boolean).join(" ");
  const funding = legalAid?.route === "legal_aid" ? "SLAB's calculator suggests I may qualify financially for civil legal aid." : "I would like to know whether you could take this on a no win no fee basis.";
  return {
    subject: "Enquiry: possible medical negligence (missed fracture)",
    body: `Dear Sir or Madam,\n\nMy name is ${name}. ${f.incidentSummary ?? ""}\n\nI would like advice on whether I may have a claim for medical negligence. ${funding}\n\nYou can reach me at ${f.email ?? ""} or ${f.phone ?? ""}.\n\nKind regards,\n${name}`,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function replay(firms: FirmFinding[], onEvent: (e: Step4Event) => void): Promise<Step4Result> {
  onEvent({ type: "status", message: "Sample run (fixture): no sites are visited and nothing is sent" });
  const trace: TraceStep[] = [];
  let i = 0;
  const t0 = Date.now();
  const step = (firm: FirmFinding, color: string, kind: TraceStep["kind"], text: string, extra: Partial<TraceStep> = {}) => {
    const s: TraceStep = { i: i++, t: Date.now() - t0, agent: firm.name, color, kind, text, firms: [firm.id], ...extra };
    trace.push(s);
    onEvent({ type: "trace", step: s });
  };
  const outcomes: EnquiryOutcome[] = [];
  for (const [k, f] of firms.entries()) {
    const color = AGENT_COLORS[k % AGENT_COLORS.length];
    onEvent({ type: "agent", tile: { id: `e${k}`, label: f.name, color, url: f.website ?? "", state: "starting", note: "Opening their website" } });
    onEvent({ type: "enquiry", enquiry: { firmId: f.id, firmName: f.name, status: "queued", formUrl: null, filled: [], unfilled: [], consents: [], note: "Waiting" } });
  }
  await wait(600);
  for (const [k, f] of firms.entries()) {
    const color = AGENT_COLORS[k % AGENT_COLORS.length];
    step(f, color, "open", `Opened ${f.website?.replace(/^https?:\/\/(www\.)?/, "") ?? "their website"}`, { url: f.website ?? undefined });
    const kind = k % 3; // 0: form + consent, 1: no form -> email, 2: form, no consents
    if (kind === 1) {
      onEvent({ type: "enquiry", enquiry: { firmId: f.id, firmName: f.name, status: "finding_form", formUrl: null, filled: [], unfilled: [], consents: [], note: "No form on the home page; looking harder" } });
      await wait(700);
      step(f, color, "recover", "No form on the contact page or in the footer; wrote an email instead");
      const to = `enquiries@${(f.website ?? "example.com").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "")}`;
      const subject = "Enquiry: possible medical negligence";
      const body = "Dear Sir or Madam, (sample email draft)";
      outcomes.push({ firmId: f.id, firmName: f.name, status: "email_draft", formUrl: null, filled: [], unfilled: [], consents: [], email: { to, subject, body, mailto: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` }, note: "No online form found, so we wrote an email for you to send" });
    } else {
      onEvent({ type: "enquiry", enquiry: { firmId: f.id, firmName: f.name, status: "filling", formUrl: f.enquiryUrl, filled: [], unfilled: [], consents: [], note: "Filling their enquiry form" } });
      await wait(700);
      step(f, color, "type", "Typed name, email, phone and message", { confidence: 0.97 });
      outcomes.push({
        firmId: f.id,
        firmName: f.name,
        status: "ready_to_send",
        formUrl: f.enquiryUrl ?? f.website,
        filled: [
          { label: "Full name", value: "(from your profile)" },
          { label: "Email", value: "(from your profile)" },
          { label: "Phone", value: "(from your profile)" },
          { label: "How can we help?", value: "(your message)" },
          ...(kind === 0 ? [{ label: "Area of law", value: "Medical negligence" }] : []),
        ],
        unfilled: [],
        consents: kind === 0 ? ["I agree to the processing of my personal data in line with the privacy policy."] : [],
        note: "Form filled on their contact page. Waiting for your approval",
      });
    }
    onEvent({ type: "enquiry", enquiry: outcomes[outcomes.length - 1] });
    onEvent({ type: "agent", tile: { id: `e${k}`, label: f.name, color, url: f.website ?? "", state: "done", note: outcomes[outcomes.length - 1].note } });
    onEvent({ type: "stats", stats: { agents: firms.length, sites: k + 1, pages: (k + 1) * 3, actions: (k + 1) * 9 } });
  }
  const result: Step4Result = { enquiries: outcomes, stats: { agents: firms.length, sites: firms.length, pages: firms.length * 3, actions: firms.length * 9 }, runId: "fixture", trace };
  onEvent({ type: "result", result });
  return result;
}
