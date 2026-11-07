# England (researched 2026-11-07)

Scope: a patient harmed by care at a **public** hospital (e.g. a missed wrist fracture in A&E) who wants (a) answers and an apology and (b) possibly compensation.
Every fact has an official source link. Mark each URL: verified (fetched, loads) / not verified / broken.

How URLs were checked: `curl -sL` with a desktop Chrome user-agent (HTTP 200 = loads), WebFetch for content, and for three sites a headless Playwright load with `scripts/probes/observe.ts` (nothing filled, nothing submitted). "verified" = loaded and content read on 2026-11-07. No form was submitted.

**Route in one line each**
1. Find the trust: nhs.uk "Find a hospital" -> hospital profile -> "Information supplied by <Trust>" / department page "managed by <Trust>"; its Contact details page gives the hospital's **PALS phone and email**.
2. Complain to the trust (PALS informally, or a formal complaint) **or** to the ICB, not both. Within 12 months. Acknowledged within 3 working days.
3. Unhappy with the final response -> Parliamentary and Health Service Ombudsman (now branded **Public Service Ombudsman**), within 12 months; online form behind its own account.
4. Compensation -> clinical negligence claim against the trust (defended by NHS Resolution), under the Pre-Action Protocol; court proceedings within 3 years.
5. Funding -> no legal aid for an adult's wrist fracture (only babies' brain/nerve injury); conditional fee agreement ("no win no fee").
6. Lawyer -> AvMA accredited panel (simple GET search) or Law Society Find a Solicitor (area "Clinical negligence"; reCAPTCHA wall).

---

## 1. Which body runs the hospital, and how a patient finds out

Acute hospitals in England are run by **NHS trusts / NHS foundation trusts**. Services are commissioned by **integrated care boards (ICBs)**, which "replaced clinical commissioning groups (CCGs) in the NHS in England from 1 July 2022" ([nhs.uk ICB list](https://www.nhs.uk/nhs-services/find-your-local-integrated-care-board/), verified).

**nhs.uk service search (yes, it exists):**
- "Find a hospital": https://www.nhs.uk/service-search/hospital (verified). One box, "Enter a town, city or postcode in England", plus "Use your location". It is an HTML `POST` form (`action="/service-search/hospital"`, field `Location`, hidden lat/long, anti-forgery `__RequestVerificationToken`). No CAPTCHA in the HTML. It does **not** say it searches by hospital name. Results page not viewed (we did not submit the form).
- Hospital profile, e.g. Leeds General Infirmary https://www.nhs.uk/services/hospital/leeds-general-infirmary/RR801 (verified) says **"Information supplied by Leeds Teaching Hospitals NHS Trust"** and links to the trust profile https://www.nhs.uk/services/trust/leeds-teaching-hospitals-nhs-trust/RR8 (verified).
- Department pages say who runs them outright: "This Department is managed by Leeds Teaching Hospitals NHS Trust." ([LGI A&E page](https://www.nhs.uk/services/hospital/leeds-general-infirmary/RR801/departments/SRV0001/accident-and-emergency-services), verified).
- The hospital **Contact details** page lists PALS: "To contact PALS at this hospital: phone 0113 206 6261 ... email patientexperience.leedsth@nhs.net" plus "Visit hospital website" ([LGI contact details](https://www.nhs.uk/services/hospital/leeds-general-infirmary/RR801/contact-details), verified). Same for St Thomas': trust link `/services/trust/guy-s-and-st-thomas-nhs-foundation-trust/RJ1`, PALS `pals@gstt.nhs.uk` / `gstt.pals-gstt@nhs.net`, tel 020 7188 8801 ([St Thomas' contact details](https://www.nhs.uk/services/hospital/st-thomas/RJ122/contact-details), verified).
- URL pattern: `nhs.uk/services/hospital/<slug>/<ODS site code>`; trust code = first 3 characters (RR801 -> RR8, RJ122 -> RJ1).
- Separate PALS search: https://www.nhs.uk/service-search/other-health-services/patient-advice-and-liaison-services-pals (verified; same POST location form).
- Which ICB: nhs.uk lists ICBs by region with no postcode box ([list](https://www.nhs.uk/nhs-services/find-your-local-integrated-care-board/), verified). NHS England's ICB contact page says: "If you're not sure which ICB to contact you can do a geographic postcode search on the NHS Organisation Data Service website. The name of the ICB appears under 'Higher Health Authority.'" ([NHS England ICB contacts](https://www.england.nhs.uk/contact-us/about-nhs-services/contact-your-local-integrated-care-board-icb/), verified). ODS portal itself: not verified (curl got no response).

## 2. Complaint to the provider

**Law:** Local Authority Social Services and National Health Service Complaints (England) Regulations 2009 ([SI 2009/309](https://www.legislation.gov.uk/uksi/2009/309/contents/made), verified).
- Time limit, reg 12(1): "a complaint must be made not later than 12 months after— (a) the date on which the matter which is the subject of the complaint occurred; or (b) if later, the date on which the matter ... came to the notice of the complainant." Reg 12(2): waived if "the complainant had good reasons" and "it is still possible to investigate the complaint effectively and fairly" ([reg 12](https://www.legislation.gov.uk/uksi/2009/309/regulation/12/made), verified).
- Reg 13(1): "A complaint may be made orally, in writing or electronically." Reg 13(3): must "acknowledge the complaint not later than 3 working days after the day on which it receives the complaint", and offer to discuss how it will be handled ([reg 13](https://www.legislation.gov.uk/uksi/2009/309/regulation/13/made), verified).
- Reg 14: written response signed by the responsible person, including the right to go to the Health Service Commissioner (Ombudsman). "relevant period" = "6 months commencing on the day on which the complaint was received" (or longer if agreed); if late, the body must explain why ([reg 14](https://www.legislation.gov.uk/uksi/2009/309/regulation/14/made), verified).

**Provider or commissioner, not both.** NHS England: "You can either complain to the NHS service provider directly" or to the commissioner; "You cannot complain to both." "Complaints should normally be made within 12 months of an incident or of it coming to your attention." Acknowledgement "within 3 working days of receiving your complaint." ([NHS England feedback and complaints](https://www.england.nhs.uk/contact-us/feedback-and-complaints/complaint/), verified; the old nhs.uk "how to complain" URL 301-redirects here.)

**Stages:** (1) optional informal PALS contact; (2) formal complaint to the trust **or** ICB ("local resolution"); (3) the Ombudsman. There is no second internal stage in the regulations.

**Three real trusts (checked 2026-11-07):**

| Trust | Online complaint form? | Other routes | Notes |
|---|---|---|---|
| Guy's and St Thomas' NHS FT (St Thomas', Guy's) | **Yes, web form, no login**: https://www.guysandstthomas.nhs.uk/form/complaints-form (verified via WebFetch). Fields: First name*, Last name*, Email*, Telephone (optional), Your complaint*, "What would you like to happen as a result of your complaint? (optional)", Consent checkbox ("I consent to having Guy's and St Thomas' NHS Foundation Trust collect my information"). No upload seen. Warns "this form is not sent over a secure network." | Phone 020 7188 3514; post Complaints department, Guy's Hospital, Great Maze Pond, London SE1 9RT; email obfuscated on page (`gstt.complaints@nhs.net` per a PALS leaflet, not verified) | Page: "Complaints should be made within a year of the date of the event." "We'll acknowledge your complaint within 3 working days." ([make a complaint](https://www.guysandstthomas.nhs.uk/contact-us/your-feedback/make-complaint), verified via WebFetch). **Bot wall:** whole site is behind Cloudflare: curl gets 403 `cf-mitigated: challenge`; **headless Playwright gets "Access forbidden"**. Headed browser not tested. |
| Leeds Teaching Hospitals NHS Trust (LGI, St James's) | **No complaint form found.** (Online feedback forms are Friends and Family Test only.) | PALS 0113 206 6261 (10am-3pm Mon-Fri), textphone 07468 753 025, email (patientexperience.leedsth@nhs.net per nhs.uk), post PALS Team, Trust HQ, St James's Hospital, Beckett Street, Leeds LS9 7TF | PALS contacts you "usually within two working days"; a Complaints Handler is allocated. Names Leeds Independent NHS Complaints Advocacy (Advonet) 0113 244 0606 ([feedback and complaints](https://www.leedsth.nhs.uk/patients/support/feedback-complaints/), verified) |
| Manchester University NHS FT (MRI, Wythenshawe, etc.) | **No complaint form found.** | complaints@mft.nhs.uk; 0161 276 4509; The Complaints Team, Cobbett House, Oxford Road, Manchester M13 9WL; PALS pals@mft.nhs.uk 0161 276 8686 | Complain "within 12 months of the event"; written response "within an agreed timeframe (usually 25-60 working days)". Advocacy: VoiceAbility ([MRI PALS page](https://mft.nhs.uk/mri/patients-visitors/i-need-support/pals/), verified) |

Takeaway: the default English route is **email or letter to the trust's complaints team**; a web form is a per-trust bonus, not the norm.

**ICB route** (alternative to the trust): e.g. NHS South East London ICB (for St Thomas'): contactus@selondonics.nhs.uk, 0208 176 5337, 160 Tooley Street, London SE1 2TZ; NHS West Yorkshire ICB (Leeds): wyicb.pals@nhs.net, 01924 552150 (both from the [NHS England ICB contacts page](https://www.england.nhs.uk/contact-us/about-nhs-services/contact-your-local-integrated-care-board-icb/), verified). [SEL ICB contact page](https://www.selondonics.org/who-we-are/contact-us/) verified (loads); [WY ICB comments page](https://www.westyorkshire.icb.nhs.uk/contact/comments-concerns-compliments) verified (loads); content of neither read.

## 3. Escalation: Ombudsman

**Parliamentary and Health Service Ombudsman**, which now calls itself the **"Public Service Ombudsman"** (home page title: "We are the Public Service Ombudsman"; https://www.ombudsman.org.uk/, verified). Helpline 0345 015 4033, "Monday to Thursday 9am to 4pm | Friday 8.30am to 12pm". "We're currently dealing with a high volume of complaints" — waits "up to eight months" for NHS England ([making a complaint](https://www.ombudsman.org.uk/making-complaint), verified).

When you can go:
- "Complain to the organisation you're unhappy with first." "complain to us within 12 months of knowing about the issue" ([NHS complaints page](https://www.ombudsman.org.uk/making-complaint/making-complaint-about-nhs-england), verified).
- The form asks for "a copy of the organisation's final response to your complaint" and "whether you've already been to court or are considering legal action"; over 12 months you must explain the delay ([what information we'll ask](https://www.ombudsman.org.uk/what-information-well-ask), verified).
- **Legal action bar:** "we need to check whether you have (or had) the option to take legal action ... The law says we cannot investigate if this is the case." "If you are looking for payment as an outcome ... you will need to have explored the option of taking legal action before you come to us." It can recommend "an apology, an explanation or a payment" but cannot "pay compensation in the way that courts and tribunals can" ([what we can and cannot help with](https://www.ombudsman.org.uk/what-we-can-and-cannot-help-nhs), verified).

**Online form** (a React app at complaintform.ombudsman.org.uk):
- **Complaint checker, no login:** https://complaintform.ombudsman.org.uk/complaintchecker (verified, headless Playwright). First question: radios "The NHS in England" / "A UK government service" / "Neither of these", then "Next question". Other checker questions found in the app code: "Have you complained directly to the organisation?", "Have you completed their complaints process?", "When did you become aware of the problem?", "Have you taken, or are you planning to take, legal action about your complaint?".
- **Form itself needs an account:** sign-in at https://complaintform.ombudsman.org.uk/login (verified loads). The app uses **Microsoft Azure AD B2C** (`phsodigital.b2clogin.com`, policies `B2C_1_SignUp`, `B2C_1_DigitalPortal`). Not NHS login, not GOV.UK One Login. Sign-up flow (email verification code?) **not tested**.
- **Multi-page:** yes. Sections from the app code: "Section 1: About you", "Section 1b: About the person affected", "Section 2: Organisation(s) details", "Section 3: About your complaint", "Section 4: The details of your complaint", "Section 5: Legal action", "Section 6: Mediation", "Section 7: Additional information", plus optional equality questions. App text: "After completing each section of the form, your progress will automatically save and you will be able to return later."
- **Uploads:** yes; app text "The size must be 30MB or less" per file; unsupported types rejected. Asks "Please avoid using 'see attached'".
- Large print / Easy Read paper forms exist; no postal address on the complaint page.

## 4. Compensation route (court, clinical negligence)

There is **no no-fault redress scheme** for adults in England (the NHS Redress Act 2006 was never brought into force; not re-verified today). The route is a **clinical negligence claim** against the trust; trusts are indemnified by **NHS Resolution** under the Clinical Negligence Scheme for Trusts ("Indemnity arrangements for NHS trusts and independent bodies that provide healthcare", https://resolution.nhs.uk/, verified).

**NHS Resolution advice for claimants** ([page](https://resolution.nhs.uk/services/claims-management/advice-for-claimants/), verified):
- Unrepresented claimants send a **letter of claim to the NHS trust responsible for your care**, with full name, address, date of birth, **National Insurance number** (for the DWP Compensation Recovery Unit), where and when treated, clinicians involved; it should "clearly state the precise nature of the allegations of breach of duty". Template: [Letter-of-claim-template.doc](https://resolution.nhs.uk/wp-content/uploads/2018/09/Letter-of-claim-template.doc) (verified, 200).
- "We strongly recommend that you consider seeking independent legal advice".

**Pre-Action Protocol for the Resolution of Clinical Disputes** ([justice.gov.uk](https://www.justice.gov.uk/courts/procedure-rules/civil/protocol/prot_rcd), verified):
- Records: copies "within 40 days of the request" (para 3.4.1); Annex B request form; failing that, a CPR 31.16 pre-action disclosure application (3.7).
- Optional **Letter of Notification** (Annex C1), acknowledged "within 14 days of receipt".
- **Letter of Claim** (Annex C2): facts, injuries, prognosis, financial loss, funding method, expert evidence (para 3.16). Acknowledge "within 14 days of receipt" (3.23); **Letter of Response** "within four months of the Letter of Claim" (3.24); "Proceedings should not be issued until after four months from the letter of claim" (3.20).
- Protocol aims "to encourage the defendant to make an early apology"; "does not alter the statutory time limits".

**Limitation:** Limitation Act 1980 s.11(4): "three years from— (a) the date on which the cause of action accrued; or (b) the date of knowledge (if later) of the person injured." ([s.11](https://www.legislation.gov.uk/ukpga/1980/58/section/11), verified). NHS Resolution: no limitation period runs for children under 18 or people who lack capacity.

## 5. Funding

**Legal aid — essentially not available for this case.** LASPO 2012 Sch 1 Pt 1 para 23 covers clinical negligence only where it "caused a neurological injury to an individual ("V") as a result of which V is severely disabled", occurring "while V was in his or her mother's womb" or during/after birth up to 8 weeks (adjusted for prematurity) ([LASPO Sch 1](https://www.legislation.gov.uk/ukpga/2012/10/schedule/1), verified).
- GOV.UK checker: https://www.gov.uk/check-legal-aid (verified) -> "Start now" -> https://checklegalaid.service.gov.uk/find-your-problem (verified, no login). Clinical negligence appears only under "More problems" as **"Clinical negligence in babies — Help if a baby has brain or nerve damage caused during pregnancy, childbirth or up to 8 weeks old."** ([more problems](https://checklegalaid.service.gov.uk/more-problems), verified). Adult clinical negligence is not listed.
- Exceptional case funding exists in principle (not researched).

**No win no fee (conditional fee agreement):** Courts and Legal Services Act 1990 s.58 + Conditional Fee Agreements Order 2013 art 5: in personal injury, success fee at first instance capped at **25%** of "general damages for pain, suffering, and loss of amenity" and past "pecuniary loss ... net of any sums recoverable by the Compensation Recovery Unit" ([art 5](https://www.legislation.gov.uk/uksi/2013/689/article/5/made), verified). Since 2013 the success fee comes out of the client's damages, not from the defendant (general knowledge, not re-verified). After-the-event insurance commonly covers expert report costs (not verified).

## 6. Finding a lawyer

**AvMA specialist clinical negligence panel** — best for an agent.
- https://my.avma.org.uk/find-a-solicitor/ (verified; headless Playwright loaded fine, **no CAPTCHA**). "You can find a solicitor near you by location or region, or by their area of special interest".
- UI: checkbox lists **Regions** ("All of England and Wales", East Midlands, East of England, Greater London, Ireland, North East England, North West England, Northern Ireland, Scotland, South East England, South West England, Wales, West Midlands, Yorkshire & Humber) and **Specialisms** (25, incl. **"Delay in Diagnosis"**, **"Orthopaedics"**, Surgery, Birth Injury...). The "Search" button runs JS that joins ticked GUIDs into hidden `region` and `spec` fields and submits a **GET** form, so results have a plain URL, e.g. `https://my.avma.org.uk/find-a-solicitor/?region=<guid>&spec=<guid>` (verified: returns firm cards with address, "Regions:" incl. "National Listing", phone, "Visit Website", named "Avma Accredited Solicitors", "Specialist Interest"). Greater London GUID `bb4472e2-a8ce-eb11-8235-000d3ad631c4`; Orthopaedics `06ad4b24-fbf4-ef11-be21-00224801c3b7`; Delay in Diagnosis `ddd0abb5-8f5f-ef11-bfe3-6045bd10f40d`.
- AvMA also: helpline 0345 123 2352 (Mon-Fri 10am-3:30pm) ([helpline](https://www.avma.org.uk/get-support-and-advice/contact-our-helpline/), verified) and a [written advice service](https://www.avma.org.uk/get-support-and-advice/written-advice-service/) (verified loads).

**Law Society "Find a Solicitor"** — https://solicitors.lawsociety.org.uk/ (verified home page). "Search the official database of 218,677 legal professionals".
- Quick search: "Your legal issue" dropdown (20 umbrella options, e.g. "Accident and Injury") + "Location" ("Postcode, town, city or country").
- Advanced search: Organisation / Person radio, "Name or SRA ID", "Location", "Area of practice" (106 options; **"Clinical negligence" = `CLI`**). GET form to `/search/results`, e.g. `?Pro=True&Type=0&Location=Leeds&AreaOfPractice1=CLI`.
- **Accreditation:** help page: "Once your search results are displayed, use the filters in the left-hand side of the screen to only show organisations that hold an accreditation" and in advanced search "Use the 'More options' button to choose the name of the accreditation scheme(s)" ([help](https://www.lawsociety.org.uk/public/for-public-visitors/using-a-solicitor/help-using-fas), verified). Home page shows a "Clinical negligence" quality mark. Scheme: [Clinical Negligence Accreditation](https://www.lawsociety.org.uk/career-advice/individual-accreditations/clinical-negligence-accreditation/) (verified loads). The filter itself was **not seen** (see blocker).
- **Blocker:** results are behind **reCAPTCHA Enterprise**. curl gets a 503 "Please wait while we verify your browser" interstitial; **headless Playwright was redirected to `/failed-captcha/`**. Headed browser not tested.

**SRA register** (to confirm a firm/solicitor is regulated): https://www.sra.org.uk/consumers/register/ (verified). One box "Search the SRA register", tabs All / Person / Firm. No area-of-practice filter.

## 7. Clinical guidelines body

**NICE** — NG38 "Fractures (non-complex): assessment and management", published 17 February 2016 (no later update shown on the page).
- **Rec 1.2.3 (Imaging of scaphoid fractures):** "Consider MRI for first-line imaging in people with suspected scaphoid fractures following a thorough clinical examination." ([NG38 recommendations](https://www.nice.org.uk/guidance/ng38/chapter/Recommendations), verified via curl; WebFetch got 403). It is the only scaphoid recommendation in section 1.2.
- Caution for the agent: "Consider" is a weak recommendation; it supports asking "why was MRI/follow-up imaging not considered?", not asserting negligence.

## 8. Free advice and advocacy

- **NHS Complaints Advocacy:** free, independent; councils have commissioned it since 2013 (Healthwatch material via search, not read). NHS England: advocates "can help write letters and attend meetings" but "can't make the complaint for you or give medical or legal advice"; it says to search "NHS complaints advocacy" or ask local Healthwatch ([NHS England](https://www.england.nhs.uk/contact-us/feedback-and-complaints/complaint/), verified). **No national lookup**; the provider varies by local authority. Examples: Leeds — Advonet "Leeds Independent NHS Complaints Advocacy" 0113 244 0606 ([Leeds TH page](https://www.leedsth.nhs.uk/patients/support/feedback-complaints/), verified; https://advonet.org.uk/ verified loads); Manchester — VoiceAbility ([MFT](https://mft.nhs.uk/mri/patients-visitors/i-need-support/pals/), verified; https://www.voiceability.org/ verified loads); Lambeth/Southwark — POhWER per older sources (not verified for 2026; https://www.pohwer.net/ verified loads).
- **Healthwatch:** [find your local Healthwatch](https://www.healthwatch.co.uk/your-local-healthwatch/list) (verified). [Help to make a complaint](https://www.healthwatch.co.uk/help-make-complaint) (verified): "Complaints must be made within 12 months of an incident or of you being made aware of the situation." **Caution:** the Health Bill 2026-27 would abolish Healthwatch England and local Healthwatch (functions to ICBs/local authorities/Secretary of State); in the Lords as of late Oct 2026 per search results, not law yet ([DHSC equality impact assessment](https://www.gov.uk/government/publications/health-bill-abolishing-healthwatch-equality-impact-assessment/health-bill-abolishing-healthwatch-england-and-local-healthwatch-equality-impact-assessment), verified loads; bill stage not verified).
- **Citizens Advice:** [NHS and social care complaints](https://www.citizensadvice.org.uk/health/nhs-and-social-care-complaints/) (verified): "This advice applies to England." "If you have a problem with an NHS service you should complain directly to them." Points to PALS, Healthwatch, CQC (CQC "can't help you directly with your problem").
- **AvMA** helpline (section 6).

## 9. Medical records access

- Right: UK GDPR subject access request (SAR). ICO: "Organisations usually have one month to respond to a SAR"; requests by email, "post, over the phone or face to face"; page notes it is "under review" after the Data (Use and Access) Act ([ICO SAR page](https://ico.org.uk/for-the-public/getting-copies-of-your-information-subject-access-request/), verified). Normally free (from trust pages; not on the ICO page fetched).
- Hospital records: ask the **trust's** Access to Health Records / information governance team, not the GP. Example Leeds TH ([SAR page](https://www.leedsth.nhs.uk/about/information-governance/subject-access-requests/), verified): email leedsth-tr.accesstohealth@nhs.net (decoded from an obfuscated link), phone 0113 206 5118, post Access to Health Records, Chancellor Wing, St James's University Hospital, Leeds LS9 7TF; "completion of the webform is optional" (no webform link found); 2 forms of ID (1 if the form is signed); "within one month" once complete; form asks "Are radiology images required?" (X-rays). Form: [SAR-Application-Form-2025-1.doc](https://www.leedsth.nhs.uk/wp-content/uploads/2025/09/SAR-Application-Form-2025-1.doc) (verified, 200). Many other trusts use a registration-based SAR portal (search results only, not verified).
- GP records: NHS App with **NHS login** (identity checks); old nhs.uk "access your health records" URL now redirects to https://www.nhs.uk/nhs-app/account/ (verified).
- Pre-Action Protocol: 40 days for records requested for a claim (section 4).

## 10. Browser-agent notes

| Step | No-login web task? | Login / ID | CAPTCHA / bot wall | Notes |
|---|---|---|---|---|
| Find trust via nhs.uk | Yes (POST search form, then profile pages by GET) | None | None seen in HTML | Profile -> "Information supplied by <Trust>"; Contact details -> PALS phone/email. Good, reliable first task |
| Trust complaint | GSTT: web form, no login. Leeds, MFT: **email/post only** | None | **GSTT: Cloudflare; headless Playwright got "Access forbidden"** | Most trusts: agent drafts an email to the complaints address |
| ICB complaint | Email/phone/post | None | n/a | Must pick trust **or** ICB |
| PHSO | Complaint checker: yes, no login. Form: **no** | Own Azure AD B2C account (email + password) | None seen | 7+ sections, autosave, 30MB uploads. Needs the trust's final response first |
| Legal aid checker | Yes (GOV.UK) | None | None | Result for an adult: not covered; useful to *show* why |
| AvMA panel | Yes; GET URL with region/spec GUIDs | None | **None** | Best lawyer-search task |
| Law Society FAS | GET form | None | **reCAPTCHA Enterprise; headless -> /failed-captcha/** | Headed untested |
| SRA register | Yes | None | Not tested | Verification step |
| NICE NG38 | Yes, read-only | None | WebFetch 403, curl 200 | Quote rec 1.2.3 |
| Records SAR | Email/post (Leeds); some trusts use portals with registration | Portal accounts vary; NHS App needs NHS login | — | |

Language: English (MFT has PALS leaflets in Arabic, Urdu, Cantonese, Bengali, Kurdish Sorani; NHS Resolution has translated resources).

**Hardest, most impressive browser task in England:** start from only "St Thomas' A&E" + the patient's postcode: use the nhs.uk hospital search -> profile -> identify **Guy's and St Thomas' NHS Foundation Trust**, its PALS contacts and website -> find the trust's own complaints page -> fill the GSTT web complaint form (stop before Send), and in parallel find the ICB (South East London) as the alternative. Risk: GSTT's Cloudflare blocks headless Chromium; test headed before the demo, fall back to an email draft to the complaints team. A blocker-free alternative: **AvMA panel search for Greater London + Orthopaedics + Delay in Diagnosis**, then open each firm's site and vet it.

**Top 3 browser tasks**
1. nhs.uk "Find a hospital" -> trust + PALS email/phone (no login, no CAPTCHA).
2. GSTT online complaint form (no login, 7 fields) — if Cloudflare lets the browser in.
3. AvMA accredited-solicitor search by region + specialism (no CAPTCHA), then firm enquiry forms. Bonus: PHSO complaint checker (no login) to show eligibility.

## 11. Fictional test persona (UK nations only)

All details invented. Hospital is real.

| Field | Value |
|---|---|
| Title / name | Ms **Megan Holloway** |
| Address | 31 Sample Lane, London (invented street) |
| Postcode | SE11 5AA (plausible Kennington/Lambeth format, not checked against the PAF) |
| Phone | 07700 900781 (Ofcom drama range) |
| Email | megan.holloway@example.com |
| Preferred contact | Email |
| Hospital | St Thomas' Hospital, Westminster Bridge Road, London SE1 7EH — Emergency Department. Trust: **Guy's and St Thomas' NHS Foundation Trust** (ODS RJ1; site RJ122). ICB: NHS South East London |
| Story | Early July 2026: fell on her outstretched hand. A&E at St Thomas' X-rayed the wrist, said it was a sprain, sent her home with no follow-up. Mid August 2026: pain persisted; GP referred her back; repeat imaging showed a scaphoid fracture. November 2026: fracture not healed (non-union), now needs surgery. She is a university student with a part-time job: missed her summer resit exams and weeks of shifts. |
| Wants | An explanation of why the fracture was missed and no follow-up imaging was arranged, an apology, and to know whether she can claim compensation |
| Deadlines (for checks) | Complaint by ~July 2027 (12 months); claim proceedings by ~July 2029 at latest (3 years; arguably from August 2026 date of knowledge) |
| Fallback hospital if GSTT blocks the browser | Leeds General Infirmary (Leeds Teaching Hospitals NHS Trust, ODS RR8), e.g. 12 Example Street, Leeds LS6 2AA |

## Sources

All accessed 2026-11-07.

| URL | Status |
|---|---|
| https://www.nhs.uk/nhs-services/hospitals/ | verified |
| https://www.nhs.uk/service-search/hospital | verified |
| https://www.nhs.uk/services/hospital/leeds-general-infirmary/RR801 | verified |
| https://www.nhs.uk/services/hospital/leeds-general-infirmary/RR801/contact-details | verified |
| https://www.nhs.uk/services/hospital/leeds-general-infirmary/RR801/departments/SRV0001/accident-and-emergency-services | verified |
| https://www.nhs.uk/services/trust/leeds-teaching-hospitals-nhs-trust/RR8 | verified |
| https://www.nhs.uk/services/hospital/st-thomas/RJ122 | verified |
| https://www.nhs.uk/services/hospital/st-thomas/RJ122/contact-details | verified |
| https://www.nhs.uk/nhs-services/hospitals/what-is-pals-patient-advice-and-liaison-service/ | verified |
| https://www.nhs.uk/service-search/other-health-services/patient-advice-and-liaison-services-pals | verified |
| https://www.nhs.uk/nhs-services/find-your-local-integrated-care-board/ | verified |
| https://www.nhs.uk/using-the-nhs/about-the-nhs/how-to-complain-to-the-nhs/ | redirects (301) to the NHS England page below |
| https://www.nhs.uk/service-search/find-a-hospital | broken (404) |
| https://www.england.nhs.uk/contact-us/feedback-and-complaints/complaint/ | verified |
| https://www.england.nhs.uk/contact-us/about-nhs-services/contact-your-local-integrated-care-board-icb/ | verified |
| https://odsportal.digital.nhs.uk/Organisation/Search | not verified (no response) |
| https://www.legislation.gov.uk/uksi/2009/309/contents/made (regs 12, 13, 14) | verified |
| https://www.guysandstthomas.nhs.uk/contact-us/your-feedback/make-complaint | verified (WebFetch); curl 403 Cloudflare |
| https://www.guysandstthomas.nhs.uk/form/complaints-form | verified (WebFetch); curl 403; headless Playwright "Access forbidden" |
| https://www.guysandstthomas.nhs.uk/contact-us/your-feedback/contact-pals | not verified (403 to curl) |
| https://www.leedsth.nhs.uk/patients/support/feedback-complaints/ | verified |
| https://mft.nhs.uk/mri/patients-visitors/i-need-support/pals/ | verified |
| https://mft.nhs.uk/app/uploads/2025/05/MFT-Complaints-Concerns-and-Compliments-Policy-V3.0.pdf | verified (loads; not read) |
| https://www.selondonics.org/who-we-are/contact-us/ | verified (loads; not read) |
| https://www.westyorkshire.icb.nhs.uk/contact/comments-concerns-compliments | verified (loads; not read) |
| https://www.ombudsman.org.uk/ | verified |
| https://www.ombudsman.org.uk/making-complaint | verified |
| https://www.ombudsman.org.uk/making-complaint/making-complaint-about-nhs-england | verified |
| https://www.ombudsman.org.uk/what-information-well-ask | verified |
| https://www.ombudsman.org.uk/what-we-can-and-cannot-help-nhs | verified |
| https://complaintform.ombudsman.org.uk/complaintchecker | verified (headless) |
| https://complaintform.ombudsman.org.uk/login | verified (SPA loads; sign-up not tested) |
| https://resolution.nhs.uk/ | verified |
| https://resolution.nhs.uk/services/claims-management/advice-for-claimants/ | verified |
| https://resolution.nhs.uk/wp-content/uploads/2018/09/Letter-of-claim-template.doc | verified (200) |
| https://www.justice.gov.uk/courts/procedure-rules/civil/protocol/prot_rcd | verified |
| https://www.legislation.gov.uk/ukpga/1980/58/section/11 | verified |
| https://www.legislation.gov.uk/ukpga/2012/10/schedule/1 | verified |
| https://www.legislation.gov.uk/uksi/2013/689/article/5/made | verified |
| https://www.gov.uk/check-legal-aid | verified |
| https://checklegalaid.service.gov.uk/find-your-problem | verified |
| https://checklegalaid.service.gov.uk/more-problems | verified |
| https://my.avma.org.uk/find-a-solicitor/ | verified (headless, results via GET verified) |
| https://www.avma.org.uk/get-support-and-advice/contact-our-helpline/ | verified |
| https://www.avma.org.uk/get-support-and-advice/written-advice-service/ | verified |
| https://solicitors.lawsociety.org.uk/ | verified (home); results page blocked by reCAPTCHA |
| https://www.lawsociety.org.uk/public/for-public-visitors/using-a-solicitor/help-using-fas | verified |
| https://www.lawsociety.org.uk/career-advice/individual-accreditations/clinical-negligence-accreditation/ | verified (loads) |
| https://www.sra.org.uk/consumers/register/ | verified |
| https://www.nice.org.uk/guidance/ng38/chapter/Recommendations | verified (curl) |
| https://www.citizensadvice.org.uk/health/nhs-and-social-care-complaints/ | verified |
| https://www.healthwatch.co.uk/help-make-complaint | verified |
| https://www.healthwatch.co.uk/your-local-healthwatch/list | verified |
| https://www.gov.uk/government/publications/health-bill-abolishing-healthwatch-equality-impact-assessment/health-bill-abolishing-healthwatch-england-and-local-healthwatch-equality-impact-assessment | verified (loads) |
| https://advonet.org.uk/ , https://www.voiceability.org/ , https://www.pohwer.net/ | verified (load) |
| https://ico.org.uk/for-the-public/getting-copies-of-your-information-subject-access-request/ | verified |
| https://www.leedsth.nhs.uk/about/information-governance/subject-access-requests/ | verified |
| https://www.leedsth.nhs.uk/wp-content/uploads/2025/09/SAR-Application-Form-2025-1.doc | verified (200) |
| https://www.nhs.uk/nhs-app/account/ | verified |
