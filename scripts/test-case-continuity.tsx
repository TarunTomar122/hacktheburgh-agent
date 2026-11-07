import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ContactLawyersStep from "../app/case/ContactLawyersStep";
import { createProfile, setLegalAid, setEnquiry, upsertEnquiries, type Profile } from "../lib/profile";
import { SAMPLE_FACTS } from "../lib/agent/sample";
import { FIXTURE_RESULT } from "../lib/agent/legalAidFixture";
import type { EnquiryOutcome } from "../lib/agent/enquiryTypes";

// Offline storage and rendering only: no real forms, API calls or submissions.
Object.assign(globalThis, { React, window: new EventTarget() });
const storage = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
const read = (): Profile => JSON.parse(storage.get("case-profile-v2")!);
createProfile(SAMPLE_FACTS, []);
setLegalAid({ funding: { onBenefits: false, partner: false, netIncomeYearly: 2500 } });
setLegalAid({ result: FIXTURE_RESULT, selected: FIXTURE_RESULT.shortlist });
assert.equal(read().legalAid?.funding.onBenefits, false);
assert.equal(read().legalAid?.funding.netIncomeYearly, 2500);
setLegalAid({ funding: { savings: 0 } });
assert.equal(read().legalAid?.funding.netIncomeYearly, 2500);
assert.equal(read().legalAid?.funding.savings, 0);

for (const status of ["sent", "replied", "not_interested"] as const) {
  upsertEnquiries([{ firmId: status, firmName: status, status, sentAt: "2026-11-01", followUpOn: "2026-11-04" }]);
  for (const pending of ["draft", "ready_to_send", "email_draft"] as const) {
    upsertEnquiries([{ firmId: status, status: pending }]);
    const row = read().enquiries!.find((r) => r.firmId === status)!;
    assert.equal(row.status, status);
    assert.equal(row.sentAt, "2026-11-01");
    assert.equal(row.followUpOn, "2026-11-04");
  }
}
upsertEnquiries([{ firmId: "sent", status: "replied" }]);
assert.equal(read().enquiries!.find((r) => r.firmId === "sent")?.status, "replied");

const [oldFirm, keptFirm, newFirm] = FIXTURE_RESULT.firms;
const outcome = (firm: typeof oldFirm): EnquiryOutcome => ({ firmId: firm.id, firmName: firm.name, status: "ready_to_send", formUrl: null, filled: [], unfilled: [], consents: [], note: "Test only" });
setEnquiry({ message: { subject: "Fictional", body: "Test only" }, outcomes: [outcome(oldFirm), outcome(keptFirm)] });
setLegalAid({ selected: [keptFirm.id, newFirm.id] });
let html = renderToStaticMarkup(<ContactLawyersStep profile={read()} onBack={() => {}} />);
assert.ok(!html.includes(oldFirm.name), "Deselected firm's card must disappear");
assert.ok(html.includes(keptFirm.name));
assert.ok(html.includes(`Fill enquiry for ${newFirm.name}`), "New selection must have a fill action");
assert.equal(read().enquiry?.outcomes?.length, 2, "Selection changes must retain history");
upsertEnquiries([{ firmId: keptFirm.id, firmName: keptFirm.name, status: "replied" }]);
upsertEnquiries([{ firmId: keptFirm.id, status: "ready_to_send" }]);
html = renderToStaticMarkup(<ContactLawyersStep profile={read()} onBack={() => {}} />);
assert.ok(!html.includes(">Review and send<"), "An already-contacted firm must not offer another send");
console.log("PASS: money answers persist, selections update, new firms are actionable, sent history survives reruns");
