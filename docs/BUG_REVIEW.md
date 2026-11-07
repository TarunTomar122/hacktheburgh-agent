# Code review - 2026-11-07

Reviewed application flows, API routes, profile persistence, browser runners, planner, funding/search, enquiry approvals, evidence extraction, live view and supporting scripts. This is a code review with targeted regression checks, not proof that every external website or model-driven path works.

## Straightforward fixes

- Failed question answers now show HTTP/network errors and allow retry.
- Failed crew runs have a retry button and hide stale questions.
- Planner streams consume a final JSON event without a trailing newline, release the reader, and ignore obsolete runs after restart/reset.
- Real crew results clear an old fixture-only enquiry flag.
- Exact date validation rejects calendar overflow; approximate dates remain allowed.
- Clicking the selected month/year mode again no longer clears its controls.
- Money parsing treats 2.5k as 2500 and blank input as unknown rather than zero.
- Skipped financial answers keep the calculator result unknown; fallback cannot replace missing amounts with zero.
- Profile wording acknowledges server logs and screenshots.

## Needs validation or a decision

### P1: Sending and consent enforcement

`lib/agent/enquiry.ts` sendEnquiry has no in-flight lock or remembered sent outcome. Repeated/concurrent requests can attempt sending again. Its remaining-consent check filters by approved text rather than verifying that approved boxes actually became checked. Sending is disabled by default; no real send was tested.

The fallback engine's generic click branch in `lib/agent/browserAgent.ts` does not enforce the checkbox restriction enforced by its check branch. Both engines rely on DOM submit classification; a JavaScript button that sends a form may be classified as a normal button. Reachability on individual live sites is unverified.

Next: local fixture tests for unchecked consent, JavaScript submit buttons, double sends and uncertain confirmation, then the required browser-engine benchmark. No real enquiries are needed for these tests.

### P1: Shared runs and approvals

`lib/agent/enquiry.ts` keeps a global approval map keyed only by firm id; the send endpoint accepts firm id and consent texts, without run identity. A second run for the same firm can replace the first run's page. Retrying one firm's form closes other registry pages while the UI retains their ready states. `lib/liveview.ts` also uses a shared process-wide bus.

Decision: single-user local demo or concurrent patients/tabs? Shared use needs run/user-scoped approvals and streams. Per-firm retry should preserve other pending approvals even in a single-user demo.

### P1: Cancellation and timeouts

`app/api/agent/plan/route.ts` cancellation stops event delivery, not the planner. `lib/agent/legalAid.ts` races a timeout against work without cancelling that work. Timed-out workers can continue browser actions or emit updates after failure. Navigation away loses the question interface while the server may continue.

Decision: should navigation/disconnection stop a run, or should it continue and be resumable? Implement that explicitly with cancellation or reconnection.

### P2: Stale material after editing facts

`lib/profile.ts` updateFacts changes facts but leaves drafts, recommendations, enquiry messages and results intact. A corrected timeline can therefore be sent with an older draft. A fresh crew run retains the old enquiry message even when its filled forms use a newly generated one.

Decision: which changes invalidate which outputs, and which user-edited drafts must be preserved? Prefer marking stale material and offering regeneration over silently deleting edits.

### P2: Injury-specific evidence

`lib/agent/evidence.ts` fixes the guideline to NICE NG38; `lib/agent/planner.ts` assesses judgments against a missed scaphoid fracture even if the patient's facts describe another condition.

Decision: restrict the demo explicitly to this injury, or select and validate condition-specific sources. This review did not verify clinical/legal guidance.

### P2: Retention policy

The incorrect server-storage claim is fixed. `lib/agent/events.ts` writes JSONL logs and runners write screenshots under `.runs`, without retention cleanup. Deleting the browser profile does not remove these files.

Decision: retention duration, deletion behavior and redaction. No existing data was deleted in this review.

### P2: Parallel firm evidence updates

Planner check_firm captures a firm before awaiting website work, then writes it back. A concurrent Law Society check can add a source that this overwrites. Later checks also do not always trigger rescoring after a shortlist exists.

Needs a deterministic concurrent-tool regression and a merge/final-scoring fix. No ranking policy was changed in this pass.

## Validation

- Passed: date/money validation regression, existing location regression, mocked skipped-income calculator, and mocked crew UI (network/HTTP answer failures, retry, final event without newline, fixture flag reset).
- The browser test initially lacked tsx's __name helper. Fixed its setup and blocked real planner requests before rerunning; the earlier fictional browser session was closed without submitting.
- Production build initially caught an encoding error introduced by the money-parser edit. The affected files were normalized to UTF-8 before rerunning.
- Final build, TypeScript and lint results are recorded in PROGRESS.md.
- Not run: live sending, all-site browser-engine benchmark, full live planner/clinical workflow, or multi-user scenarios.
