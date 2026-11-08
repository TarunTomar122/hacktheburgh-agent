# Yellow Card live probe

Probed Sun 8 Nov 2026 (~03:00-03:45) in Chrome. Cookies rejected, fictional persona (Isla Grant, example.com email, EH8 9YL), medicine ACCORD-UK IBUPROFEN, side effect, "Continue without registering". Stopped on Step 4: **Submit never pressed**, Register never pressed, no password set.

Journey: `/` -> `/report-guide` -> `/about-you` -> `/new-report` (Steps 1-4 all share this one URL; the page redraws in place).

## Home `/`
- `input#product_lookup`: react-autosuggest, `role=combobox`. Suggestions are `ul[role=listbox] > li[role=option]` (grouped "Medicine" etc, upper-case names).
- Picking one then "Start report" goes to `/report-guide`.
- "Report something not on our list" fallbacks: blood transfusion/donation; "A medicine, vaccine, device or E-cigarette which I can't see on the list"; "If you don't know the product type".

## `/report-guide`
- `select#reportUser`: Healthcare professional (2) | Member of the public (3).
- `select#reportRelating` appears only after the first: sideEffect "A suspected side effect" | fake | defective.
- "Next step" disabled until both set.

## `/about-you`
Required (no "(Optional)" in label, `required` attribute set): `occupation` (public/hcp), `publicProfessionId` (You / Consumer / Your child / Someone else, GUID values), `title` (Mr, Mrs, Miss, Ms, Dr, Sir, Prof, Mx, Prefer not to say), `firstName`, `lastName`, `email`, `postalCode`, `privacy` (checkbox).
Optional: address search + lines, `telephoneCountryCode` (246 options), `telephone`, `telephoneExtension`, `emailCommunicationsPermitted`, `password`.
Use "Continue without registering". Never "Register".
Errors: `<p id="error_<fieldId>">` + `aria-invalid=true`, text "<Label> is required".

## `/new-report` Step 1 of 4 "Whose Side Effect"
- Fields (all labelled "(Optional)"): `patientinitial` (text), `patientsex` (1 Male, 2 Female), `patientgpmedicalrecordnumb` (NHS number), DOB `patientbirthdate_year/_month/_day` (+ calendar), "I don't know the date of birth" checkbox, `patientethnicity` (18 options), weight (KG/LB tabs), height (CM/FT tabs).
- **Hidden requirement:** at least one of initials, sex or age. Every field says "(Optional)" so a "skip optional fields" rule fails here.
- Error markup differs from About You: `[role=alert]` text "Error - Minimum of 1 patient identifier needed - Patient initials, Patient sex, Patient age at time of the side effect", plus `aria-invalid=true` on patientinitial, patientsex and the DOB selects. No `error_<id>` elements.
- Two "Next step" buttons (top and bottom).

## Step 2 of 4 "Side Effects"
- Initially a box "Reaction details" showing "Press 'Add' Below" and one **Add** button. Pressing Add opens the sub-form and the first Add button goes away (only the sub-form's Add remains).
- Sub-form fields: 
  - `reaction_add_reactionmeddrallt` "Side effect": **react-select**. Typing shows `div.mhraUISelect__option` (id `react-select-N-option-K`) inside `.mhraUISelect__menu`. **No `role=option`, no `role=listbox`.** Input has `aria-autocomplete=list`, `autocomplete=off`.
  - Suggestions are MedDRA terms and include non-reactions: typing "head" gave Head CT, Head MRI, Head lag, Headache, Pain head, Head cold, Head pain, Head lice, Whiteheads.
  - After picking, the text input clears; the choice shows as `[class*=singleValue]` and a hidden input `reactionmeddrallt=Headache`.
  - `reaction_add_reactionstartdate_year/_month/_day` (optional, year list 2026 back, 108 options).
  - `reaction_add_reactionoutcome` (**required**): 1 Recovered/resolved, 2 Recovering/resolving, 3 Not recovered/not resolved, 4 Recovered with some lasting effects, 5 Caused death, 6 Unknown.
  - `reaction_add_reactionenddate_year/_month/_day` (optional).
  - Sub-form **Add** button (type=button).
- Pressing sub-form Add with the outcome empty: "Field is required" under the outcome, `aria-invalid` on `reaction_add_reactionoutcome`.
- After a valid Add: the form closes, list shows "1. Headache  Edit  Delete" and a new **Add** button appears; "Press 'Add' Below" disappears.
- Also on this step: severity checkboxes `seriousnessnotserious`, `seriousnessmild`, `seriousnessuncomfortable`, `seriousnessaffectlifestyle`, `seriousnessdisabling`, `seriousnessother` ("Significant enough to lead you to seek advice from a healthcare professional"), `seriousnesshospitalization`, `seriousnesscongenitalanomali`, `seriousnesslifethreatening`, plus greyed "Caused death". Every label says "(Optional)".
- Free text `narrativeincludeclinical`, select `reactionduetomedicationerror` (1 Yes, 2 No), both optional.
- **Errors are layered**, only one layer shown per Next press:
  1. Nothing set: "Please indicate why the reaction was serious by selecting at least one value" on every severity box (`aria-invalid`), nothing about reactions.
  2. Severity ticked, no reaction: "Field is required" under "Reaction details", **no `aria-invalid`, not an `error_` id**.

## Step 3 of 4 "About the medicines suspected to have caused a side effect"
- The chosen product is already listed ("1. ACCORD-UK IBUPROFEN Suspect") and a medicine form (`drug_0_*`) is open: `drug_0_medicinalproduct` (react-style autoselect), batch, start date, `drug_0_actiondrug` (1 Drug withdrawn, 2 Dose reduced, 3 Dose increased, 4 Dose not changed, 0 Unknown, 9 Not applicable), indication, end date, dosage, method, where obtained, **Add**, attachment Yes/No. **Nothing here is required.**
- First "Next step" with the form open does not advance: it collapses the form into the committed card (Edit/Delete icons). Second "Next step" advances.

## Step 4 of 4 "Additional Details"
- "Other medicines taken alongside" (optional, own "Press 'Add' Below" box + Add), `patientmedicalhistorytext` (optional), **Submit** (final, do not press while probing).
- No required fields.

## What the agent does about it (lib/agent/yellowCard.ts, 2026-11-08, NOT yet run end to end)
1. Reaction suggestions: matched with `.mhraUISelect__option` (was `[role=option]`, which does not exist on this field). The exact option text is clicked, so "Pain" no longer picks "Pain head".
2. Reaction dropdowns: addressed by id (`reaction_add_reactionstartdate_year/_month/_day`, `reaction_add_reactionoutcome`). The old code listed the selects once, before the year was chosen, so the empty month select looked like "the outcome" and the required outcome was never set. Year, month and day are now set in turn, waiting for each one's options.
3. Reaction Add: success now means the form closed. If the site keeps it open, the site's own error is reported. A term the site cannot find does not stop the others, and the demo default "Pain" is the last resort.
4. Step 1: with no saved initials (someone else), the initials box is marked required so the user is asked for it by name.
5. Step 3: "Next step" is pressed (up to 3 times) until the page moves on. Nothing on the page is filled.
6. Step 4: every element is ignored, so the run ends as ready_to_submit without touching Submit.
7. About You title and postcode: left as they were. Missing values already make the agent ask the user.

Test: `npm run agent:yellowcard` (and `-- --someone-else`). Nothing is sent: Submit and Register are never clicked.
