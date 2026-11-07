# Ireland (Republic of Ireland) (researched 2026-11-07)

Scope: a patient harmed by care at a **public** hospital (e.g. a missed wrist fracture in A&E) who wants (a) answers and an apology and (b) possibly compensation.
Every fact has an official source link. Mark each URL: verified (fetched, loads) / not verified / broken.

"Verified" here means fetched with curl or WebFetch on 2026-11-07 and returned HTTP 200 with the quoted content. Several Irish government sites (ombudsman.ie, citizensinformation.ie) return **403 to plain curl/WebFetch** but 200 when sent normal browser headers (`User-Agent` of a desktop Chrome plus `Accept: text/html`). A real browser loads them fine.

**Route in one line:** raise it locally, then make a formal complaint under the HSE's **Your Service Your Say** process (email, post or phone; there is no longer a national web form) → internal review → **Office of the Ombudsman** (online form, no login). For money, sue the hospital in court for clinical negligence (handled by the **State Claims Agency**). The **Injuries Resolution Board is skipped** for medical negligence. Time limit: **2 years from the date of knowledge**. Big catch: **clinical judgement (the diagnosis itself) is excluded** from both the HSE complaints process and the Ombudsman.

## 1. Which body runs the hospital, and how a patient finds out

- Public hospitals are run by the **Health Service Executive (HSE)**, or by voluntary and statutory hospitals that the HSE funds (e.g. Mater, Beaumont, St Vincent's, Tallaght, St James's). Both kinds are covered by the State's Clinical Indemnity Scheme (section 4).
- Since 2024 the HSE has been organised into **6 health regions**, which replaced the old hospital groups and community healthcare organisations. Each region "provides both hospital and community care". Source: https://about.hse.ie/our-work/hse-health-regions/ (verified)

  | Region | Counties |
  |---|---|
  | HSE Dublin and North East | North Dublin, Meath, Louth, Cavan, Monaghan |
  | HSE Dublin and Midlands | Longford, Westmeath, Offaly, Laois, Kildare, parts of south Dublin and Wicklow |
  | HSE Dublin and South East | South Tipperary, Waterford, Kilkenny, Carlow, Wexford, Wicklow, part of south Dublin |
  | HSE Mid West | Limerick, North Tipperary, Clare |
  | HSE South West | Kerry, Cork |
  | HSE West and North West | Donegal, Sligo, Leitrim, Roscommon, Mayo, Galway |

- **How a patient finds the hospital and its complaints contact:** use HSE "Find a hospital" at https://www2.hse.ie/services/hospitals/ (verified).
  - It has a "Search by place" box, 52 results in alphabetical order, and pagination via `?page=N`.
  - Each hospital has its own page, e.g. https://www.hse.ie/services/hospitals/st-jamess-hospital-dublin/ (verified). That page lists the complaints contact: "Complaints Officer, Patient Experience Office ... St James's Hospital", phone 01 410 3361, email patientfeedback@stjames.ie.
  - Hospital pages do not name the health region.

## 2. Complaint to the provider (online form? URL, login needed?, stages, time limits, response times)

**The national HSE complaints process is "Your Service Your Say" (YSYS).** Main page: https://www2.hse.ie/complaints-feedback/your-service-your-say/ (verified; "Page last reviewed: 17/02/2026").

### How to complain

- **There is no national online form any more.** The page lists only:
  - **Email:** "Email: yoursay@hse.ie"
  - **Post:** "You can post a letter or a completed feedback form to Your Service Your Say. HSE Your Service Your Say, Oak House, Limetree Avenue, Millennium Park, Naas, County Kildare, W91 KDC2"
  - **Phone:** "Freephone: 1800 424 555 ... Monday to Friday, 9am to 5pm"
  - **Printed form:** "Your service your say feedback form (PDF, 570 KB, 12 pages)" at https://assets.hse.ie/media/documents/Your_service_your_say_adult_leaflet.pdf (verified, loads as PDF). Forms are also available "in 24 languages" at https://www2.hse.ie/complaints-feedback/languages/ (link present; not separately fetched).
- **The old online form URLs are dead:**
  - https://www2.hse.ie/services/forms/your-service-your-say → **broken (404)**.
  - https://www.hse.ie/yoursay (the address printed on older leaflets) now just redirects to https://www2.hse.ie/complaints-feedback/ (verified).
  - Citizens Information still says complaints can be made "by post, phone, email, online". That is out of date (page edited 22 October 2024).
- **What to include in a formal complaint** (YSYS page): "what happened and when; who was involved; where it happened; what your concerns are; anything you have done to resolve this matter; what you want to happen now; any extra information and copies of other relevant documents".
- **After emailing**, the YSYS page says: "you'll get an automatic email ... We'll send your feedback to the service you gave feedback about ... a complaints officer from the service will contact you. This is Stage 2".
- **Alternative:** email the hospital's own complaints office directly, as listed on its HSE hospital page (e.g. patientfeedback@stjames.ie). Beaumont uses pals@beaumont.ie, per https://www.beaumont.ie/feedback (verified 200; email address taken from search snippet). The Mater's feedback page, https://www.mater.ie/patients/your-feedback/, returned **403 to curl** (not verified).

### Stages

Source: https://www2.hse.ie/complaints-feedback/your-service-your-say-stages/ (verified)

1. **Stage 1 – local.** A staff member or manager tries to resolve it; "the manager tries to resolve the complaint within 48 hours".
2. **Stage 2 – complaints officer.**
   - "contacts you within 5 working days" if an investigation is needed.
   - For a formal investigation, they "respond within 30 working days" and then "update you every 20 working days".
3. **Stage 3 – internal review.** "A review officer responds within 20 working days."
4. **Stage 4 – external review** by the Office of the Ombudsman (or the Ombudsman for Children).

### Time limit and exclusions

Source: Citizens Information, https://www.citizensinformation.ie/en/health/health-system/making-a-complaint-about-the-health-service-executive/ (verified with browser headers; "Page edited: 22 October 2024")

- **Time limit:** "You must make the complaint within 12 months of the date of the event you want to complain about or within 12 months of the person becoming aware of the issue. A complaints officer may extend the time limit if there are special circumstances involved." The legal basis is Part 9 of the Health Act 2004.
- **Clinical judgement exclusion (critical for a missed fracture).** Under "Complaints that are not covered", you cannot complain about:
  - "A clinical judgment (medical decision) of a person acting on behalf of the HSE or a service provider"
  - "An action taken by the HSE or a service provider that was solely based on the advice of someone using their clinical judgment"
  - "An issue that is, or has been, the subject of legal proceedings before a court or tribunal"

  **What this means in practice:** the misdiagnosis itself is outside YSYS. The non-clinical parts can still go through it: communication, delays, follow-up, failing to recall the patient after the X-ray was reported, and records. Some hospitals handle clinical-judgement complaints separately, outside YSYS. Wording varies by hospital and was not verified individually.

## 3. Escalation: ombudsman or regulator (online form? multi-page? uploads? time limits)

### Office of the Ombudsman

- **Entry page:** https://www.ombudsman.ie/en/publication/000df-making-a-complaint/ (verified with browser headers; "Last updated on 10 June 2026"). Old `/making-a-complaint/` paths redirect into the new site. Key quotes:
  - "Before you contact us you should first try to resolve your complaint with the relevant service provider."
  - "We cannot look into a complaint if it is made more than 12 months after you initially complained of the action or you became aware of that action, unless there are very special circumstances"
  - Checklist: "You have complained to the service provider and allowed it six weeks to respond; You have received a final response ... (You may complain to us if there is a long delay ...); You have used the service provider's appeals process".
  - "As it is not possible to save the complaint form, you should have all information to hand, and relevant documents ready to upload, before you begin."
- **What it cannot examine:** https://ombudsman.ie/en/publication/22bcc-what-we-can-investigate/ (verified with browser headers).
  - "The Ombudsman cannot examine complaints about: **clinical judgements (for example, the diagnosis or treatment of a patient made by, or on behalf of, the HSE** or private nursing homes)".
  - "Unless the circumstances are exceptional, the Ombudsman cannot examine your complaint if you have started legal proceedings against the service provider about the same complaint. You can get legal advice about your complaint and still bring it to the Ombudsman as long as you don't actually start legal proceedings."
  - The Citizens Information Ombudsman page (edited 7 September 2026) confirms: "Clinical judgements of doctors or other medical professionals" are excluded. Source: https://www.citizensinformation.ie/en/government-in-ireland/how-government-works/standards-and-accountability/office-of-the-ombudsman/ (verified with browser headers).
  - Extending the Ombudsman's remit to clinical judgement is a Programme for Government commitment. **No source found that it has been enacted** (not verified).
- **AI policy, relevant to Elliot:** "Policy on the Use of AI tools to prepare material for correspondence with the Office of the Ombudsman" (published 8 May 2026, updated 10 June 2026). Source: https://ombudsman.ie/en/organisation-information/ba6b9-policy-on-the-use-of-ai-tools-to-prepare-material-for-correspondence-with-the-office-of-the-ombudsman/ (verified with browser headers). Key quotes:
  - "the most important information that you can provide ... is a clear and simple description of what has happened in your own words"
  - "you may be asked to resubmit your case, in your own words"
  - Suggested disclosure: "Parts of this correspondence were drafted using an AI tool. I have reviewed and confirmed the accuracy of the content."
  - **Agent implication:** keep the text the agent drafts short, factual, in the patient's voice, and patient-reviewed.

#### The online form

- **Wrapper page:** https://ombudsman.ie/en/form/f80d6-make-a-complaint-online/ (verified). It embeds an iframe.
- **Form itself:** **https://forms.ombudsman.ie/en/66e986b93d1fad0024221273** (verified 200; add `?embedded=true` for the iframe version).
- **Platform:** the Irish government "forms.ie"/OGCIO forms platform. The form definition is embedded as JSON in the page (`window.__remixContext`), which is how the facts below were read.
- **Login:** none (`"authType":"NIL"`).
- **Drafts:** cannot be saved (`"enableDraft":false`).
- **Languages:** English and Irish (`en-IE`, `ga-IE`).
- **Estimated time:** about 5 minutes (`estTimeTaken: 5`).
- **CAPTCHA:** yes (`"hasCaptcha":true`). It is **Google reCAPTCHA v3**, scored (PASS threshold 0.3), with a fallback "visualChallengeKey", i.e. a visible challenge if the score is low. Before rendering, the page says "We're performing some checks now to make everything safe". **JavaScript is required.**
- **Address:** Eircode verification and lookup are enabled.
- **Uploads:** many file types allowed (pdf, doc/docx, jpg/png, etc.).
- **Pages:** multi-page (page breaks), roughly 6–8 pages with conditional logic:
  1. **"Make sure you can make a complaint to us"**
     - Dropdown (required): "Name of the public service provider or nursing home you wish to complain about". **794 options**, no "other". Includes "Health Service Executive", "St James's Hospital", "Beaumont Hospital", "Mater Misericordiae University Hospital", "Tallaght University Hospital", "University Hospital Galway", "Cork University Hospital", etc.
  2. **"Background to your complaint"**
     - "Have you already complained or appealed to the public service provider ...?" (radio)
  3. **Your complaint to the provider**
     - "Do you have a copy of your complaint to the service provider?" (radio)
     - Upload the complaint (attachment), or explain why you cannot (textarea + acknowledgement checkbox).
  4. **The provider's response**
     - "Did you get a final response ...?" (radio)
     - "Do you have a copy of the response ...?" (radio)
     - Upload it, or explain why not.
     - "Is it six weeks or more since you contacted them?" (radio)
  5. **"Your complaint"** – five required textareas:
     - "Please give us the main points of the complaint"
     - "What did the service provider fail to do, or do wrong?"
     - "Tell us how you suffered as a result of what happened"
     - "What result would you like us to achieve for you?"
     - "When did the action you are complaining about happen?"
  6. **"Your documents"** – three optional uploads.
  7. **"Your details"**
     - On behalf of someone else? Consent?
     - Title, first name, last name, Country, Address line 1, Address line 2, City, County (dropdown), Eircode, email (required), phone (required), special requirements.
  8. **"Details of the person you are applying on behalf of"** (conditional) – same fields again.
  9. A summary page (`disableSummaryPage:false`), then Submit. **Stop before Submit.**
- **After submission**, a case reference like "OMB-xxxxxx-xxxxxx" is emailed (form text).
- **Other contact:** Office of the Ombudsman, 6 Earlsfort Terrace, Dublin 2, D02 W773, phone (01) 639 5600 (per Citizens Information).

### Regulators (fitness to practise, not compensation)

- **Medical Council** (doctors). Complaint form page: https://www.medicalcouncil.ie/public-information/making-a-complaint-/complaint-form/ (verified; redirects to https://www.medicalcouncil.ie/complaints/making-a-complaint/complaint-form.html).
  - "Our complaint form is available here to download as a PDF. This form may be completed on your computer and emailed directly to our Complaints team at complaints@mcirl.ie. It can also be sent by post."
  - The PDF is `/complaints/making-a-complaint/complaint-form-april-2023.pdf` (link present, not fetched).
  - **It is a fillable PDF, not a web form.** The page carries reCAPTCHA scripts, but the complaint itself is a PDF sent by email.
  - The Council says its process "is not designed to resolve disputes or disagreements between doctors and their patients". Source: https://www.medicalcouncil.ie/complaints/ (verified).
- **HIQA** does not investigate individual complaints. It takes "concerns" by phone (021 240 9646), email concerns@hiqa.ie, or post. "Where we have the legal power to do so, we may investigate your concern. Where we don't have this power, we will direct you to the best place". Source: https://www.hiqa.ie/get-touch/report-concern-or-give-feedback (verified). No web form found.

## 4. Compensation route (court, redress or no-fault scheme; pre-action rules; limitation period)

- **No no-fault scheme and no redress scheme.** Compensation means a clinical negligence claim in court, against the HSE or the voluntary hospital as defendant.
- **State Claims Agency (SCA)** manages the claim under the **Clinical Indemnity Scheme**. Source: https://www.stateclaims.ie/state-indemnity/clinical-indemnity-scheme (verified).
  - The scheme gives State indemnity "in respect of the provision of professional medical services". The State authorities covered are "primarily the HSE and organisations in the voluntary health and social care sector".
  - The authority "remains the legal defendant" while the SCA manages the claim. GP services are not covered.
- **How to start (SCA FAQ):** https://www.stateclaims.ie/about-us/frequently-asked-questions/general-visitors-frequently-asked-questions/making-a-claim (verified)
  - For clinical claims, "you or your solicitor should submit a letter of claim to stateclaims@ntma.ie".
  - "must formally notify the person/organisation you hold responsible for your injury within one month".
  - The SCA "Clinical claims resolution" unit uses "alternative dispute resolution methods, such as mediation, and ... settlement negotiations". Source: https://www.stateclaims.ie/services/claims-resolution/clinical-claims-resolution (verified).
- **Letter of claim, statutory basis:** Civil Liability and Courts Act 2004, s.8. Source: https://revisedacts.lawreform.ie/eli/2004/act/31/section/8/revised/en/html (verified).
  - If a plaintiff "fails, without reasonable cause, to serve a notice in writing, before the expiration of **one month from the date of the cause of action** ... the court ... shall draw such inferences ... and ... make no order as to the payment of costs" (or reduce costs).
  - The Revised Act notes that the clinical-negligence amendments in Legal Services Regulation Act 2015 s.220 are "not commenced as of date of revision". The 2015 Act's **pre-action protocol for clinical negligence has not been commenced**; no 2025–26 commencement order was found (not verified beyond that annotation).
- **Injuries Resolution Board does NOT cover medical negligence (confirmed).** Source: https://www.citizensinformation.ie/en/justice/civil-law/injuries-resolution-board/ (verified with browser headers; edited 5 November 2025).
  - "All personal injury claims in Ireland, **except for medical negligence claims**, must be submitted to the Injuries Resolution Board."
  - IRB home: https://www.injuries.ie/eng/ (verified).
- **Limitation period: 2 years from accrual or date of knowledge.** Statute of Limitations (Amendment) Act 1991 s.3(1). Source: https://revisedacts.lawreform.ie/eli/1991/act/18/section/3/revised/en/html (verified).
  - An action for personal injuries caused by negligence "shall not be brought after the expiration of **2 years** from the date on which the cause of action accrued or the date of knowledge (if later) of the person injured".
  - "Date of knowledge" is defined in s.2: https://revisedacts.lawreform.ie/eli/1991/act/18/section/2/revised/en/html (verified).
  - Citizens Information paraphrase: "A personal injuries claim must be started within 2 years of you becoming aware that your injuries were caused by another's negligence or when you ought to have become aware of those facts". Source: https://www.citizensinformation.ie/en/justice/civil-law/taking-and-appealing-a-civil-case/ (verified with browser headers).
- **Court tiers and costs risk:** "if your case is heard in the Circuit Court and you are awarded less than €15,000 ... you may be penalised in costs. And if ... in the High Court and you are awarded less than €75,000 ..." (same Citizens Information page).
- **Open disclosure:** the Patient Safety (Notifiable Incidents and Open Disclosure) Act 2023 commenced on 26 September 2024. It mandates disclosure of specified serious incidents. A missed fracture is unlikely to be on the notifiable list. Source: gov.ie press release https://www.gov.ie/en/press-release/9e647-minister-for-health-announces-commencement-of-the-patient-safety-notifiable-incidents-and-open-disclosure-act-2023 (not verified; from search).

## 5. Funding (legal aid and any online eligibility checker; no win no fee rules)

### Legal Aid Board: does cover medical negligence

- **Coverage:** "We can provide legal advice and legal representation in the area of Medical Negligence in our specialised Law Centre in Smithfield, Dublin. However you can also contact your local Law Centre". The Medical Negligence Unit is at "Law Centre Smithfield, 48/49 North Brunswick Street, Georges Lane, Dublin 7, D07 PE0C". Source: https://www.legalaidboard.ie/our-legal-aid-service/how-we-can-help-you/medical-negligence/ (verified).
- **Means and merits:** "To qualify for Legal Aid Services you must have disposable income under €18,000." Disposable capital and the merits of the case are also assessed, and most people pay a contribution. Source: https://www.legalaidboard.ie/our-legal-aid-service/apply-now/financial-eligibility-and-merits-test/ (verified).
- **Online eligibility checker (no login, no CAPTCHA):** https://www.legalaidboard.ie/our-legal-aid-service/apply-now/financial-eligibility-and-merits-test/financial-eligibility-calculator/ (verified).
  - "This on-line indicator is a less complex version of the means test ... It can only act as a guide."
  - "It does not send any information to us".
  - It is a plain HTML form: radio buttons for dependent spouse, children and other adults; number fields such as `Employment`, `SWHealth`, `RentSup`, `AllowAcccommodation`, `AllowIncomeTax`, `AllowPRSI`, `AllowUSC`; and a confirm checkbox.
- **Applying:** https://www.legalaidboard.ie/our-legal-aid-service/apply-now/ (verified).
  - "You will be required to provide personal details such as address and PPS number ... You can apply online below or ... download".
  - The online application is at https://onlineapp1.board.ie/ (**not verified**: timed out / 302 with no response from this network; login and CAPTCHA status unknown).
  - Successful applicants go on a Law Centre **waiting list**.

### No win no fee

- **"No foal, no fee" arrangements are lawful.** The client pays no fee if the case loses.
- **Percentage-of-damages fees are banned.** Legal Services Regulation Act 2015 s.149(1)(a) prohibits charging "legal costs in connection with contentious business expressed as a specified percentage or proportion of any damages". Source: https://revisedacts.lawreform.ie/eli/2015/act/65/section/149/revised/en/html (verified 200; wording quoted via secondary sources).
- **Advertising "no win no fee" for personal injury is prohibited.** Under the Legal Services Regulation Act 2015 (Advertising) Regulations 2020, references to "no win no fee" or "free first consultation" that imply personal-injury services at no cost are banned. Source: Law Society guidance https://www.lawsociety.ie/link/176de7e33e5742d7b36c6ed1f57f06c0.aspx (not verified; search snippet).
- **Agent implication:** firm websites will not say "no win no fee", so don't filter on it.

## 6. Finding a lawyer (official register or directory: URL, search fields such as specialism and location; accreditation panels)

- **Law Society of Ireland "Find a Solicitor":** https://www.lawsociety.ie/find-a-solicitor (verified). The search itself is at https://www.lawsociety.ie/find-a-solicitor/Solicitor-Firm-Search/ (verified).
- **Search fields:**
  - Keyword text box, `txtSearchNameLocation` ("Enter a keyword to begin your search").
  - "I'm looking for": Solicitor / Firm.
  - "Located in": Republic of Ireland / Northern Ireland / Rest of the World.
  - County: 32 counties, including the Northern Ireland counties.
  - Organisation type: Law / Industry / State.
  - Practising status.
  - Sort: relevance / name / county.
- **No practice-area or specialism filter for solicitors.** The `ddPracticeArea` dropdown belongs to the "Find a Mediator" search. So the agent cannot filter for clinical negligence in the official register.
- **Technical notes:**
  - The form is JavaScript-driven (`onsubmit="return false;"`, results loaded by script) and has no CAPTCHA.
  - A firm profile is at `/firm-profile`.
  - The Law Society disclaims that the data is "for information only".
- **No official accreditation panel for clinical negligence in Ireland** (none found, unlike AvMA/APIL panels in the UK). The Legal Aid Board's own Medical Negligence Unit (section 5) is the only official specialist.

## 7. Clinical guidelines body (national guideline site; the guidance for suspected scaphoid fracture if findable)

- **National Clinical Effectiveness Committee (NCEC) National Clinical Guidelines** (Department of Health): https://www.gov.ie/en/department-of-health/collections/national-clinical-guidelines/ (verified).
  - The old URL https://www.gov.ie/en/collection/c9e90-national-clinical-guidelines/ is **broken (404)**.
  - The list covers sepsis, early warning systems (EMEWS, IMEWS, PEWS), cancers, asthma, diabetes, nutrition, clinical handover, etc.
  - It has **no fracture, trauma or musculoskeletal guideline**.
- **Suspected scaphoid fracture:** **no Irish national guideline found.**
  - Irish EDs rely on local protocols and UK guidance (NICE NG38 "Fractures (non-complex)", RCEM). Those are UK sources and not binding in Ireland.
  - An Irish Medical Journal audit from St James's ED notes "up to 40% of scaphoid fractures can be missed at initial presentation" (https://imj.ie/?p=5291, not verified).
  - **Agent implication:** cite NICE/RCEM as the persuasive standard and ask the hospital for its local ED scaphoid protocol (via FOI or SAR).

## 8. Free advice and advocacy

- **Patient Advocacy Service (PAS):** https://www.patientadvocacyservice.ie/ (verified).
  - Covers public acute hospitals, nursing homes, and support after patient safety incidents.
  - "The Patient Advocacy Service is independent, free and confidential." It is funded by the Department of Health and is independent of the HSE.
  - Contact:
    - National line 0818 293003.
    - Email info@patientadvocacyservice.ie.
    - Post: Level 3 Rear Unit, Marshalsea Court, Merchant's Quay, Dublin D08 AEY8.
    - **Online enquiry form**, no login: https://www.patientadvocacyservice.ie/patient-advocacy-service-queries/ (verified). It is a Gravity Form with fields: Name*, Email*, Query*, and a data protection consent checkbox*. **Cloudflare Turnstile** CAPTCHA.
  - Contact page: https://www.patientadvocacyservice.ie/contact-us/ (verified).
  - Step-by-step guide: https://www.patientadvocacyservice.ie/step-by-step/ (link present, not fetched).
  - PAS does not give legal advice or help with compensation (nothing on the site says it does).
- **Citizens Information:** https://www.citizensinformation.ie/ (verified with browser headers; returns 403 to bots). Phone 0818 07 4000 (not verified).
- **FLAC (Free Legal Advice Centres):** https://www.flac.ie/ (not verified) offers free basic legal information and phone advice.

## 9. Medical records access

- **Data protection Subject Access Request (SAR) to the HSE or hospital:** https://www2.hse.ie/data-protection-and-your-rights/data-protection-requests/ (verified).
  - You need "your completed form ... a copy of government-issued photo ID, such as your passport, driving licence, public services card".
  - Describe the data, dates and locations, e.g. "department of service involved - for example Emergency Department, St. James' Hospital".
  - Form: "Subject Access Request form (PDF, 77 KB, 1 page)" at https://assets.hse.ie/media/documents/sarsform.pdf (verified).
  - The HSE normally charges nothing and aims to respond within **1 month**, extendable by 2 months for complex requests (per search of HSE pages; old URL https://www.hse.ie/eng/gdpr/requesting-information-from-the-hse/ is **broken (404)**).
- **Freedom of Information Act 2014:** an alternative route. No fee for personal records; decision within 4 weeks. The old HSE FOI page https://www.hse.ie/eng/services/yourhealthservice/info/foi/ is **broken (404)**.
- **Where to send:** to the hospital or agency that holds the records. Voluntary hospitals (Mater, Beaumont, etc.) are their own data controllers.
- **Regulator** if the request is refused: Data Protection Commission, https://www.dataprotection.ie/ (verified).
- **No online records portal** for patients. It is a PDF form plus photo ID by email or post.

## 10. Browser-agent notes

| Step | Online without login? | Form type | Login / ID | CAPTCHA / bot wall | Notes |
|---|---|---|---|---|---|
| 1. Find hospital and complaints contact | Yes | Search box + paginated list (`/services/hospitals/?page=N`) | None | None seen | Hospital page gives the complaints officer's email |
| 2. HSE complaint (YSYS) | **No web form** | Email yoursay@hse.ie (or the hospital's complaints email), post, phone, or 12-page PDF | None | n/a | Agent can only **draft the email/letter** for the patient to send; old web form URL is 404 |
| 2b. Patient Advocacy Service enquiry | Yes | 3-field Gravity Form | None | **Cloudflare Turnstile** | Simple; Turnstile may block headless browsers |
| 3. Ombudsman complaint | **Yes** | Multi-page government form with conditional logic, 794-option provider dropdown, file uploads, Eircode lookup, summary page | None (`authType: NIL`) | **reCAPTCHA v3** (score) with visual fallback; site returns 403 to bot user agents | Cannot save drafts; must have documents ready; **AI-use policy**: keep text short, in the patient's own words |
| 3b. Medical Council | Partly | Fillable PDF, emailed | None | reCAPTCHA on the page | Not a web form |
| 3c. HIQA concern | No | Phone/email/post | – | – | |
| 4. Compensation (SCA / court) | No | Letter of claim by solicitor to stateclaims@ntma.ie | – | – | Agent can draft a letter-of-claim summary; 1-month notice and 2-year limit warnings |
| 5. Legal aid eligibility | **Yes** | Plain HTML calculator, nothing submitted | None | None | Easy, safe demo |
| 5b. Legal aid application | Unknown | https://onlineapp1.board.ie/ | Unknown (needs PPS number) | Unknown | Could not load from here |
| 6. Find a solicitor | **Yes** | JS search: keyword, county, type, status | None | None | **No specialism filter**: the agent must search "medical negligence" as a keyword or use the county, then check firm websites |
| 7. Guidelines | Yes | Static pages | None | None | No Irish scaphoid guideline |
| 9. Records (SAR) | No web form | 1-page PDF + photo ID | None | – | Agent can pre-fill the PDF content for the patient to print or sign |

### Other notes

- **Language:** English everywhere. The Ombudsman form and gov.ie are also in Irish (`ga-IE`). The HSE YSYS form comes in 24 languages as PDFs.
- **Bot walls:** ombudsman.ie, citizensinformation.ie and mater.ie answer 403 to non-browser user agents (WAF on AWS ELB). A real Playwright or Chrome session should pass, but expect reCAPTCHA v3 scoring on the Ombudsman form. A low score triggers a visual challenge that the agent must hand to the human.
- **No national ID login needed for any complaint step.**
  - MyGovID is used across gov.ie services, but **none of the complaint routes here require it**.
  - The Legal Aid online application asks for a PPS number. Its login status was not verified.
- **Content trap for the agent:** both the HSE and the Ombudsman exclude "clinical judgement". Frame the complaint around:
  - process and communication failures (e.g. "X-ray not reviewed / no follow-up / not told of the result / delay")
  - not "the doctor misdiagnosed me".

  Claims about the diagnosis itself belong in the negligence route.

### Hardest, most impressive browser task

**Fill the Ombudsman's multi-page online complaint form** at https://forms.ombudsman.ie/en/66e986b93d1fad0024221273, stopping at the summary page before Submit:

1. Pick the correct hospital from a 794-entry dropdown with no "other" option. The agent must map, e.g., "St James's" to "St James's Hospital" and not choose "Health Service Executive" by mistake.
2. Answer the branching questions about the earlier complaint and the response (yes/no paths change which upload fields appear).
3. Upload the patient's original YSYS complaint email and the HSE final response.
4. Write the five required narrative answers in the patient's own words. Keep them short, avoid clinical-judgement framing, and add the AI-use disclosure.
5. Complete the details page with an Irish address, County dropdown and Eircode lookup.
6. Do all of it in one session (no draft saving) under a reCAPTCHA v3 score.

A good warm-up is the Legal Aid Board financial eligibility calculator, which is safe because nothing is sent.

## Sources

| URL | Status |
|---|---|
| https://about.hse.ie/our-work/hse-health-regions/ | verified |
| https://www2.hse.ie/services/hospitals/ | verified |
| https://www.hse.ie/services/hospitals/st-jamess-hospital-dublin/ | verified |
| https://www2.hse.ie/complaints-feedback/ | verified |
| https://www2.hse.ie/complaints-feedback/your-service-your-say/ | verified |
| https://www2.hse.ie/complaints-feedback/your-service-your-say-stages/ | verified |
| https://assets.hse.ie/media/documents/Your_service_your_say_adult_leaflet.pdf | verified |
| https://www2.hse.ie/complaints-feedback/languages/ | not verified (link present) |
| https://www2.hse.ie/services/forms/your-service-your-say | **broken (404)** |
| https://www.hse.ie/yoursay | verified (redirects to /complaints-feedback/) |
| https://www.beaumont.ie/feedback | verified (200) |
| https://www.mater.ie/patients/your-feedback/ | not verified (403 to curl) |
| https://www.citizensinformation.ie/en/health/health-system/making-a-complaint-about-the-health-service-executive/ | verified (browser headers) |
| https://www.citizensinformation.ie/en/government-in-ireland/how-government-works/standards-and-accountability/office-of-the-ombudsman/ | verified (browser headers) |
| https://www.citizensinformation.ie/en/justice/civil-law/injuries-resolution-board/ | verified (browser headers) |
| https://www.citizensinformation.ie/en/justice/civil-law/taking-and-appealing-a-civil-case/ | verified (browser headers) |
| https://www.ombudsman.ie/en/publication/000df-making-a-complaint/ | verified (browser headers) |
| https://ombudsman.ie/en/publication/22bcc-what-we-can-investigate/ | verified (browser headers) |
| https://ombudsman.ie/en/organisation-information/ba6b9-policy-on-the-use-of-ai-tools-to-prepare-material-for-correspondence-with-the-office-of-the-ombudsman/ | verified (browser headers) |
| https://ombudsman.ie/en/form/f80d6-make-a-complaint-online/ | verified |
| https://forms.ombudsman.ie/en/66e986b93d1fad0024221273 | verified (form JSON parsed) |
| https://www.medicalcouncil.ie/complaints/ | verified |
| https://www.medicalcouncil.ie/public-information/making-a-complaint-/complaint-form/ | verified (redirects) |
| https://www.hiqa.ie/get-touch/report-concern-or-give-feedback | verified |
| https://www.stateclaims.ie/state-indemnity/clinical-indemnity-scheme | verified |
| https://www.stateclaims.ie/about-us/frequently-asked-questions/general-visitors-frequently-asked-questions/making-a-claim | verified |
| https://www.stateclaims.ie/services/claims-resolution/clinical-claims-resolution | verified |
| https://www.injuries.ie/eng/ | verified |
| https://revisedacts.lawreform.ie/eli/1991/act/18/section/3/revised/en/html | verified |
| https://revisedacts.lawreform.ie/eli/1991/act/18/section/2/revised/en/html | verified |
| https://revisedacts.lawreform.ie/eli/2004/act/31/section/8/revised/en/html | verified |
| https://revisedacts.lawreform.ie/eli/2015/act/65/section/149/revised/en/html | verified (200) |
| https://www.gov.ie/en/press-release/9e647-minister-for-health-announces-commencement-of-the-patient-safety-notifiable-incidents-and-open-disclosure-act-2023 | not verified |
| https://www.legalaidboard.ie/our-legal-aid-service/how-we-can-help-you/medical-negligence/ | verified |
| https://www.legalaidboard.ie/our-legal-aid-service/apply-now/financial-eligibility-and-merits-test/ | verified |
| https://www.legalaidboard.ie/our-legal-aid-service/apply-now/financial-eligibility-and-merits-test/financial-eligibility-calculator/ | verified |
| https://www.legalaidboard.ie/our-legal-aid-service/apply-now/ | verified |
| https://onlineapp1.board.ie/ | not verified (no response) |
| https://www.lawsociety.ie/link/176de7e33e5742d7b36c6ed1f57f06c0.aspx | not verified |
| https://www.lawsociety.ie/find-a-solicitor | verified |
| https://www.lawsociety.ie/find-a-solicitor/Solicitor-Firm-Search/ | verified |
| https://www.gov.ie/en/department-of-health/collections/national-clinical-guidelines/ | verified |
| https://www.gov.ie/en/collection/c9e90-national-clinical-guidelines/ | **broken (404)** |
| https://imj.ie/?p=5291 | not verified |
| https://www.patientadvocacyservice.ie/ | verified |
| https://www.patientadvocacyservice.ie/contact-us/ | verified |
| https://www.patientadvocacyservice.ie/patient-advocacy-service-queries/ | verified |
| https://www.flac.ie/ | not verified |
| https://www2.hse.ie/data-protection-and-your-rights/data-protection-requests/ | verified |
| https://assets.hse.ie/media/documents/sarsform.pdf | verified |
| https://www.hse.ie/eng/gdpr/requesting-information-from-the-hse/ | **broken (404)** |
| https://www.hse.ie/eng/services/yourhealthservice/info/foi/ | **broken (404)** |
| https://www.dataprotection.ie/ | verified |
