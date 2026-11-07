# New Zealand (researched 2026-11-07)

Scope: a patient harmed by care at a **public** hospital (e.g. a missed wrist fracture in A&E) who wants (a) answers and an apology and (b) possibly compensation.
Every fact has an official source link. Mark each URL: verified (fetched, loads) / not verified / broken.

**Route in one line:** Health NZ regional feedback form (complaint to the hospital) -> free Advocacy Service (optional) -> Health and Disability Commissioner (HDC) online complaint -> **compensation through ACC's no-fault treatment injury cover, which a registered health professional lodges for the patient (ACC45 + ACC2152)**. Suing for compensatory damages is barred. ACC disputes go to independent review (ACC33), then the District Court.

**The main difference from the UK:** there is no negligence claim. Compensation comes only through ACC, and fault is not in issue. The complaint (HDC) and compensation (ACC) routes are separate and run in parallel. The HDC states that it "cannot assist with obtaining compensation".

Access notes (from curl / WebFetch on 2026-11-07):
- `acc.co.nz` sits behind **Imperva Incapsula**. curl and WebFetch got an "Request unsuccessful. Incapsula incident ID" stub, not the page. All ACC HTML pages below are therefore **not verified** (they return HTTP 200, but the body is the bot wall). ACC PDFs under `/assets/` did download.
- `legislation.govt.nz` returned HTTP 202 with an empty body to curl and 403 to WebFetch (a bot challenge). Statute text is quoted from secondary sources and marked as such.
- `ombudsman.parliament.nz` returned 403 to curl.

## 1. Which body runs the hospital, and how a patient finds out

- Every public hospital is run by **Health New Zealand | Te Whatu Ora** ("Health NZ"), a single national Crown entity. The Pae Ora (Healthy Futures) Act 2022 "disestablished all 20 district health boards and merged their functions and assets into Health New Zealand | Te Whatu Ora on 1 July 2022" (Office of the Auditor-General).
  - https://oag.parliament.nz/data/health-reforms/about-health-reform (not verified; search snippet)
- `tewhatuora.govt.nz` now redirects to **healthnz.govt.nz** (verified 200).
- **Finding the hospital:** use the Health NZ "Find a hospital" list, which is organised by region (Auckland, Bay of Plenty, Canterbury and so on), with each hospital listed under its region.
  - https://www.healthnz.govt.nz/hospitals-services/hospitals (verified 200)
- **For an agent:** map the patient's hospital to its Health NZ region, then use that region's feedback form (section 2). The old DHB domains (such as `bopdhb.health.nz`) redirect to healthnz.govt.nz.

## 2. Complaint to the provider (online form? URL, login needed?, stages, time limits, response times)

**Hub page:** "Provide suggestions, feedback or a complaint"
- https://www.healthnz.govt.nz/contact-us/feedback-hospitals (verified 200)
- Quote: "If you or your whānau have immediate concerns about your treatment or care, speak directly to those providing your care or the manager of that area. If you feel uncomfortable talking to them or are not satisfied with their response, you can share your concerns with us."

**There are 17 regional forms, not one national form.** Each region's form has different fields. All were checked on 2026-11-07:

| Region | URL | Status | Type |
|---|---|---|---|
| Auckland (Central) | https://www.healthnz.govt.nz/hospitals-services/hospitals/auckland/feedback-central | verified 200 | web form, reCAPTCHA v3 |
| Auckland (North and West) | https://www.healthnz.govt.nz/hospitals-services/hospitals/auckland/feedback-auckland-north-west | verified 200 | web form, reCAPTCHA v3 |
| Auckland (East and South) | https://www.healthnz.govt.nz/hospitals-services/hospitals/auckland/feedback-south-east | verified 200 | web form, reCAPTCHA v3 |
| Bay of Plenty | https://www.healthnz.govt.nz/hospitals-services/hospitals/bay-of-plenty/bay-of-plenty-feedback-form | verified 200 | web form, reCAPTCHA v3 |
| Canterbury | https://www.healthnz.govt.nz/hospitals-services/hospitals/canterbury/canterbury-feedback-form | verified 200 | web form, reCAPTCHA v3 |
| Hawke's Bay | https://www.healthnz.govt.nz/assets/Locations/Hawkes-Bay/hawkes-bay-freepost-feedback-form.pdf | verified 200 | **PDF only (freepost)** |
| Manawatū-Whanganui | https://forms.office.com/Pages/ResponsePage.aspx?id=XdgHhCPtd0WRwpLiLa_o5cyIsEDAwh1MqHz1mYA4BH9UQlBNWTRZNVJLSDNLQzk5QThQT0g2MzRMNS4u | verified 200 | **Microsoft Forms** (external) |
| Nelson Marlborough | https://www.healthnz.govt.nz/hospitals-services/hospitals/nelson-marlborough/feedback-form | verified 200 | web form, reCAPTCHA v3 |
| Northland | https://www.healthnz.govt.nz/hospitals-services/hospitals/northland/northland-feedback-form | verified 200 | web form, reCAPTCHA v3 |
| Otago and Southland | https://www.healthnz.govt.nz/hospitals-services/hospitals/otago-southland/feedback | verified 200 | web form, reCAPTCHA v3 |
| Rotorua and Taupō | https://www.healthnz.govt.nz/hospitals-services/hospitals/rotorua-taupo-lakes/feedback | verified 200 | web form, reCAPTCHA v3 |
| South Canterbury | https://www.healthnz.govt.nz/hospitals-services/hospitals/south-canterbury/feedback-form | verified 200 | web form, reCAPTCHA v3 |
| Tairāwhiti Gisborne | https://www.healthnz.govt.nz/hospitals-services/hospitals/tairawhiti-gisborne/tairawhiti-feedback-form | verified 200 | web form, reCAPTCHA v3 |
| Taranaki | https://www.healthnz.govt.nz/hospitals-services/hospitals/taranaki/taranaki-feedback-form | verified 200 | web form, reCAPTCHA v3 |
| Wellington, Hutt and Kāpiti | https://www.healthnz.govt.nz/hospitals-services/hospitals/wellington-hutt-and-kapiti/wellington-hutt-and-kapiti-feedback-form | verified 200 | web form, reCAPTCHA v3 |
| West Coast | https://www.healthnz.govt.nz/hospitals-services/hospitals/west-coast/west-coast-feedback-form | verified 200 | web form, reCAPTCHA v3 |
| Waikato | https://www.healthnz.govt.nz/hospitals-services/hospitals/waikato/waikato-feedback-form | verified 200 | web form, reCAPTCHA v3 |
| Wairarapa | https://www.healthnz.govt.nz/hospitals-services/hospitals/wairarapa/wairarapa-feedback-complaints-and-compliments | verified 200 | web form, reCAPTCHA v3 |

**Form details** (from the HTML of the Canterbury, Auckland Central and Wellington forms):
- **Login:** none.
- **Pages:** one page (SilverStripe UserForms, `POST`).
- **CAPTCHA:** **Google reCAPTCHA v3**, which is invisible and score-based (`api.js?render=<sitekey>`, hidden `g-recaptcha-response`). There is no puzzle to solve, but a low score may reject an automated Submit. That does not matter if we stop before Submit.
- **Uploads:** none. Quote from the Canterbury form: "Files cannot be uploaded to this form for security reasons. If you have a file to support your submission, you will be able to send this to us when our team acknowledges your email."
- **Canterbury fields:**
  - Type (Enquiry / Suggestion or compliment / Complaint), which reveals conditional fields
  - on behalf of someone else? (relationship, their name and date of birth, permission Y/N)
  - date of event
  - where (select), ward or area, facility
  - **Details of the complaint** (required)
  - suggested resolution
  - your name, date of birth, preferred contact, phone, email, address
- **Auckland Central fields:**
  - first name, surname, email, phone
  - patient / whānau / visitor
  - on-behalf tickbox; patient name, **NHI number**, date of birth
  - Complaint / Compliment / Concern / Suggestion
  - contact wanted?
  - location / service
  - "Tell us about your experience"
- **Wellington fields:**
  - name, email
  - hospital (select: Wellington Regional / Hutt / Kenepuru / Kāpiti)
  - approximate date
  - disability question
  - on behalf? NHI, consent tickbox
  - "Your feedback"

**Provider response times.** Right 10 of the Code of Health and Disability Services Consumers' Rights is binding on all providers. From HDC Fact sheet 3:
- "A provider must acknowledge any complaint in writing within 5 working days (Right 10(6)(a))"
- "A decision on whether the complaint is justified or not, or whether more time is needed to investigate the complaint, must be made by the provider within 10 working days of giving written acknowledgement of receipt of the complaint (Right 10(7))."
- If more than 20 working days are needed, the provider must tell the consumer why.
- Progress updates are due "at intervals of not more than one month (Right 10(4))".
- Sources:
  - https://www.hdc.org.nz/media/agwpy53y/factsheet3-timeframesforrespondingtocomplaintsunderright10.pdf (verified 200)
  - https://www.hdc.org.nz/your-rights/about-the-code/code-of-health-and-disability-services-consumers-rights/ (verified 200)

**Time limit for complaining to the provider:** no statutory limit was found.

**Raising concerns directly** (HDC guidance): https://www.hdc.org.nz/making-a-complaint/how-to-raise-your-concerns-directly/ (verified 200)

## 3. Escalation: ombudsman or regulator (online form? multi-page? uploads? time limits)

### Health and Disability Commissioner (HDC), the main escalation body

Key URLs:
- Overview: https://www.hdc.org.nz/making-a-complaint/ (verified 200)
- "Make a complaint" (read-first page): https://www.hdc.org.nz/making-a-complaint/make-a-complaint/ (verified 200)
- **Online form:** https://www.hdc.org.nz/making-a-complaint/make-a-complaint/complaint-form/ (verified 200)
- Form preview PDF (11 pages of screenshots of the form): https://www.hdc.org.nz/media/iptl32jj/complaint-form-preview.pdf (verified 200)
- Consent form for complaining for someone else: https://www.hdc.org.nz/media/w0cdfv3i/consumer-consent-executor-consent-form.pdf (not verified)
- Process page: https://www.hdc.org.nz/making-a-complaint/complaint-process/ (verified 200)
- Contact: https://www.hdc.org.nz/contact-us/ (verified 200). Phone 0800 11 22 33; post to PO Box 1791, Auckland 1140.

**How the form works:**
- **Login:** none.
- **CAPTCHA:** none on step 1. No reCAPTCHA, hCaptcha or Turnstile markup was found in the page.
- **Platform:** Umbraco Forms. Server-side **multi-step** (`FormStep`, `__next` button, anti-forgery token).
- Quote: "if the form is not completed it cannot be saved." There is no save-and-resume.

**Steps** (taken from the preview PDF):
1. **Getting started.**
   - An **AI notice** (verbatim on the live form): "Complaints that rely heavily on AI-generated content, rather than your personal experience and concerns, may be more difficult to assess... Where a complaint appears to be substantially AI-generated and does not clearly reflect your own account, we may be unable to adequately assess the concerns raised and request that you resubmit it in your own words."
   - "Are you complaining on behalf of someone else?" No / Yes.
2. **About you.** All of these are required:
   - title, first and last name
   - **NHI** (National Health Index number)
   - gender, date of birth (DD/MM/YYYY), age group
   - ethnicity (checkboxes)
   - disability Y/N, functional difficulties, accessibility needs
   - email, phone
   - NZ address with an **address-autocomplete** field ("Search for a NZ address"), then street, suburb, city, postcode
   - best contact method
3. (If on behalf) **Tell us about the person you are making the complaint for.**
   - their contact details, relationship
   - "Is the person ... aware...?"
   - "Their consent may be necessary".
4. **Tell us about the complaint.**
   - provider name
   - provider type (Doctor / Nurse / ... / Other)
   - relationship to provider
   - provider address
   - other providers
   - "Have you asked the Nationwide Health and Disability Advocacy Service for help to resolve your complaint?" (required)
5. **Tell us about what happened.**
   - dates and details (required)
   - **"Attach any relevant files"**: a file upload, "such as the original complaint letter and response, letters, reports or photos".
   - "Have you or they tried to resolve your complaint with the provider directly?" If Yes: details and outcome.
   - main issues 1 to 3
   - "What do you want to happen?" (required)
   - **"Did this incident occur more than two years ago?"** (required)
   - other people who can help
   - "Have you made a complaint to another agency about this matter? e.g. ACC..."
   - **then a Submit button. STOP here.**

**HDC "make a complaint" page also says:**
- Prepare "Your NHI number or the NHI number of the person whom the complaint is about."
- Prepare "your ACC claim number (if you have an ACC treatment injury claim)".
- "We continue to accept complaints by post."

**Time limits:** no statutory deadline is stated. The form asks whether the incident was more than two years ago. The process page says old matters may get no further action because "the evidence needed to make a decision is no longer available".

**Outcomes** (process page):
- Referral to the Advocacy Service or back to the provider ("Complaints are often sorted out at this stage")
- Referral to another agency
- No further action
- Recommendations, or a request that the provider apologise
- A formal investigation: "This is a serious step, and often it takes about two years."
- Rarely, after a breach finding, referral to the **Director of Proceedings**. The Director can bring proceedings in the Human Rights Review Tribunal, which is one of the narrow routes to damages outside ACC (s 317(4), see section 4).

**Timeframes:** "It may take only a few days or a year or more." HDC aims to update the complainant "approximately every three months".

**Compensation:** "HDC cannot assist with obtaining compensation or refunds for health and disability services." The page points people to ACC for treatment injuries.

### Other bodies (secondary for this scenario)

- **Ombudsman.** Covers administrative decisions by Health NZ and ACC. The site returned 403 to curl, so it was not checked: https://www.ombudsman.parliament.nz/ (not verified, bot wall). HDC is the right body for clinical care.
- **Health Quality & Safety Commission (Te Tāhū Hauora).** Runs the national adverse-events learning policy. It does not take individual complaints. https://www.hqsc.govt.nz/our-work/system-safety/healing-learning-and-improving-from-harm/ (verified 200)
- **Practitioner regulators** such as the Medical Council: HDC refers complaints to them as needed.

## 4. Compensation route (court, redress or no-fault scheme; pre-action rules; limitation period)

### The bar on suing

Accident Compensation Act 2001 **s 317(1)** bars proceedings for compensatory damages arising "directly or indirectly out of personal injury covered by" the Act. **s 319** preserves **exemplary (punitive) damages**, which are rare and need outrageous conduct. s 317(4) leaves certain HDC Act and Human Rights Act proceedings open.
- Statute: https://www.legislation.govt.nz/act/public/2001/0049/latest/DLM101883.html (not verified: 403 bot wall). Wording taken from secondary sources, including the Supreme Court *Couch v Attorney-General* summary: https://www.courtsofnz.govt.nz/assets/5-The-Courts/supreme-court/case-summaries/case-information-2006/sc-49-2006-susan-couch-v-agfebruary-2009.pdf (not verified)
- In practice there is **no medical negligence litigation route for compensatory damages**.

### ACC treatment injury cover (no-fault)

**What is covered.** Community Law Manual, ch. 19:
- "You're covered by ACC if you suffer an injury while getting medical treatment from a doctor or other health professional."
- Cover excludes "a necessary part or ordinary consequence of treatment".
- Cover also applies when staff "failed to give treatment when it was needed".
- "You don't have to prove that the provider made a mistake."
- **Missed or delayed diagnosis:** cover can be refused if "earlier treatment would not have changed the outcome".
- Other exclusions: injury "mostly caused by an underlying health condition", and health-resourcing decisions.
- Source: https://communitylaw.org.nz/community-law-manual/chapter-19-accident-compensation-acc/when-youre-covered-by-acc-and-when-youre-not/injuries-caused-by-medical-treatment-treatment-injuries/ (verified 200)
- Statute: s 32 (treatment injury) at legislation.govt.nz (not verified, bot wall).

**Who lodges the claim (the key point for the agent):**
- **The patient cannot self-lodge a treatment injury claim online.**
- Community Law: "You claim by lodging an ACC 45 Injury Claim Form ... The form has to be completed by a treatment provider such as a doctor, physiotherapist or ambulance driver."
- ACC provider guidance:
  - "As a registered provider, you can lodge claims on behalf of your patient".
  - For treatment injury, "tick the 'is this claim for treatment injury' box on the ACC45".
  - "Your patient or authorised representative must confirm their consent for you to lodge the claim, and it must be recorded."
  - An **ACC2152 Treatment Injury Claim form** goes with the ACC45, with clinical notes sent to the Treatment Injury Centre (clinical.notes@acc.co.nz, per search snippet).
- Sources:
  - https://www.acc.co.nz/for-providers/lodging-claims/lodging-a-claim-for-a-patient (not verified: Incapsula; content from search snippet)
  - https://www.acc.co.nz/assets/provider/acc2152-treatment-injury-claim.doc (not verified)
  - https://www.acc.co.nz/assets/provider/405074f420/treatment-injury-claim-lodgement-guide.pdf (verified: downloads, 772 KB, but text could not be extracted)
  - https://communitylaw.org.nz/community-law-manual/chapter-19-accident-compensation-acc/making-a-claim-and-dealing-with-acc/ (verified 200)
- A survivor-support site (Kōnae, not official) notes that the patient can ask **a different health professional** (for example their GP) to lodge if the treating clinician will not.
- **Practical route for the persona:** ask the GP or the hospital to lodge an ACC45 treatment injury claim. Online, the patient can only prepare a request letter or summary for the GP.

**MyACC (patient portal):**
- Login is by **email + password or RealMe**.
- It is for **existing** claims: viewing a claim, requesting support and payments. After a claim is accepted, "you will have also received an email or sms text message with a registration code".
- The login page is https://my.acc.co.nz/login (verified 200). It is a JavaScript single-page app, and its HTML references "captcha".
- Info page: https://www.acc.co.nz/im-injured/myacc/about-myacc (not verified, Incapsula).

**Time limits:**
- "You have to lodge your claim for ACC cover within 12 months after the date of your accident or injury" (Community Law, s 53).
- For treatment injury, ACC policy counts 12 months from the later of "the date the registered health professional (RHP) first considered the personal injury to be a treatment injury" or the s 38 injury date.
- Late claims: "ACC must not decline a claim on the grounds that it was lodged late, unless the claim's lateness prejudices the ability of ACC to determine cover."
- Source: https://acc.co.nz/assets/Policy-and-procedure-documents/assess-claim-for-cover-_-late-lodged-claim.pdf (not verified; search snippet)

**Decision time:**
- Treatment injury claims are "complicated claims", with a final decision due within **nine months** of lodgement. Extensions beyond the initial period need notice to the client, and further extensions need the client's agreement.
- If ACC misses the deadline, "the law says you're covered" (Community Law).
- Sources:
  - https://www.acc.co.nz/assets/Policy-and-Procedure-documents/Cover-decision-timeframes-policy.pdf (not verified)
  - https://communitylaw.org.nz/community-law-manual/chapter-19-accident-compensation-acc/making-a-claim-and-dealing-with-acc/how-acc-processes-the-claim/ (verified via WebFetch link list; not curl-checked)

**What ACC pays:** treatment costs, weekly compensation for lost earnings, and a lump sum for permanent impairment. The details sit on acc.co.nz, which was not readable (Incapsula). Not verified here.

### Disputing an ACC decision

- **Independent review:** apply on form **ACC33** (or by letter) "within three months of the decision", to accreviewapplication@acc.co.nz. FairWay Resolution or ICRA hears it.
- If ACC does not set a hearing date within 3 months, the decision is deemed in the claimant's favour.
- After review, appeal to the **District Court**.
- Sources:
  - https://www.acc.co.nz/contact/get-a-decision-reviewed/ (not verified, Incapsula)
  - https://www.acc.co.nz/assets/general/acc33-application-for-an-independent-review-v2.docx (not verified)
  - https://communitylaw.org.nz/community-law-manual/chapter-19-accident-compensation-acc/challenging-an-acc-decision/independent-reviews/ (verified 200)

**Pre-action rules:** not applicable, because there is no civil claim.

**ACC phone numbers:** claims helpline 0800 101 996; general line 0800 432 266 (from search snippets).

## 5. Funding (legal aid and any online eligibility checker; no win no fee rules)

- **No claim costs:** ACC is free to claim; no lawyer is needed to lodge.
- **Civil legal aid** (Ministry of Justice) covers "a civil matter (such as a dispute over money, housing, ACC or a job)".
  - "Legal aid is considered a loan."
  - You apply **through a legal aid lawyer**, who helps fill in the application. There is no public online self-application or eligibility calculator: the guessed URL `/legal-aid-eligibility-calculator/` returns **404 (broken)**. The ministry suggests checking eligibility with a Citizens Advice Bureau or Community Law Centre.
  - Civil decisions take about 5 working days.
  - Sources:
    - https://www.justice.govt.nz/courts/going-to-court/legal-aid/ (verified 200)
    - https://www.justice.govt.nz/courts/going-to-court/legal-aid/get-legal-aid/ (verified via WebFetch)
    - https://www.justice.govt.nz/courts/going-to-court/legal-aid/get-legal-aid/can-i-get-family-or-civil-legal-aid/ (verified 200)
    - Legal aid lawyer finder: https://www.justice.govt.nz/courts/going-to-court/legal-aid/get-legal-aid/legal-aid-lawyer-finder/ (verified 200)
- **Legal aid for ACC disputes:** Community Law says "Legal Aid may be available for legal representation at an independent ACC review hearing" and for District Court appeals: https://communitylaw.org.nz/community-law-manual/chapter-19-accident-compensation-acc/challenging-an-acc-decision/appeal-to-district-court-and-higher-courts/ (not verified).
- **No win no fee:** not relevant to ACC entitlements. Conditional fees for exemplary damages claims were not researched.
- **Advocacy is free:** HDC complaints and the Advocacy Service cost nothing.

## 6. Finding a lawyer (official register or directory: URL, search fields such as specialism and location; accreditation panels)

**NZ Law Society "Find a lawyer"**
- https://www.lawsociety.org.nz/for-the-public/find-a-lawyer/ (verified 200; Incapsula script present but the page is served)
- Quote: "use our search tool to find a lawyer by name, location, or area of law".
- **Fields:**
  - Keyword
  - **Areas of law** (codes, e.g. `AC` = ACC, `HE` = Health)
  - Specialisation (e.g. Appeals, Legal Aid)
  - Region and District
  - Lawyer type
  - Languages spoken
- **No login.** Results are server-rendered and **deep-linkable with GET parameters** (tested 2026-11-07):
  - `?PracticeAreas=AC&Regions=Canterbury` -> "Showing 9 of 9 results"
  - `?PracticeAreas=AC` -> 46 results
  - `?PracticeAreas=HE&Regions=Auckland` -> 15 results
- There is no "personal injury" or "medical negligence" filter. Use **ACC** (and Health).

**Other registers**
- Public Register of Lawyers (practising status): https://www.lawsociety.org.nz/registry-lookup/ (verified 200)
- No official specialist accreditation panel for ACC or medical law was found.
- Legal aid lawyer finder (see section 5).

## 7. Clinical guidelines body (national guideline site; the guidance for suspected scaphoid fracture if findable)

- **No NICE or SIGN equivalent.** Guidance is fragmented across:
  - Health NZ national and regional clinical guidelines
  - **HealthPathways**: regional, mostly **login-restricted** for clinicians
  - bpac^nz and specialist colleges
  - Starship (paediatrics)
- **No official national NZ guideline for suspected scaphoid fracture was found.**
  - A Bay of Plenty patient page on scaphoid fracture (https://bopdhb.health.nz/health-and-support/health-wellbeing-services-and-advice/orthopaedic-injuries/scaphoid-fracture) now **redirects** to a generic Health NZ "broken bones first aid" page (verified 200, but the content is gone; treat as broken for scaphoid).
  - wikiMSK (an NZ-authored clinician wiki, not official) notes that MRI and CT are generally not available in NZ primary care: https://wikiMSK.org/wiki/Scaphoid_Fracture (not verified)
- The standard NZ urgent care approach (immobilise an X-ray-negative suspected scaphoid fracture and review or re-image in 10 to 14 days) comes from the journal literature, not a national guideline.
- **For the agent:** expect to cite international guidance (for example the UK RCEM / NICE, or the BSSH pathway) rather than an NZ body.

## 8. Free advice and advocacy

**Nationwide Health and Disability Advocacy Service** (funded through HDC, independent of providers)
- https://www.advocacy.org.nz/ (verified 200)
- Freephone **0800 555 050** (8.30am to 5pm, Monday to Friday); advocacy@advocacy.org.nz
- HDC says: "It is a free service, and advocates are independent of all health and disability service providers and agencies." https://www.hdc.org.nz/making-a-complaint/talk-to-the-advocacy-service/ (verified 200)
- Advocates help write the complaint letter to the provider and support meetings.
- **Online contact form:** https://www.advocacy.org.nz/contact (verified 200).
  - Webflow form, **no login**, protected by **Cloudflare Turnstile** (`data-turnstile-sitekey`).
  - Fields:
    - first name, last name, date of birth (all required)
    - phone, email (required)
    - address, city (required), region, postcode, country
    - preferred contact method
    - enquiry subject (required)
    - message (required)
  - Referral page: https://www.advocacy.org.nz/referral (not verified)

**Community Law Centres** (free legal help, including ACC)
- https://communitylaw.org.nz/our-law-centres/ (verified 200). It has a "Quick find" location tool.
- Eligibility: https://communitylaw.org.nz/free-legal-help/eligibility/ (not verified)
- Community Law Manual, ch. 19 (ACC), is the best plain-language source: https://communitylaw.org.nz/community-law-manual/chapter-19-accident-compensation-acc/making-a-claim-and-dealing-with-acc/ (verified 200)

**Other**
- Citizens Advice Bureau: not researched.
- **ACC-specific advocacy** (for example ACC review advocates): not researched.

## 9. Medical records access

**The right and the time limit.** Health Information Privacy Code 2020, **Rule 6**:
- An individual can request their health information. The agency has **20 working days** to decide.
- The 20 days exclude weekends, public holidays and 25 December to 15 January.
- Transfer to another agency must happen within 10 working days.
- Sources:
  - https://www.privacy.org.nz/blog/health-info-the-right-to-know-made-easy/ (not verified)
  - HIPC Fact sheet 4: https://www.privacy.org.nz/assets/DOCUMENTS/HIPC-Fact-Sheets/HIPC-Factsheet-4-Dealing-with-Access-Requests-2025-Brand-Update-A1084405.pdf (not verified)
- **Public agencies (Health NZ) generally cannot charge** (Privacy Commissioner charging guidance): https://privacy.org.nz/responsibilities/charging-for-access-to-personal-information/ (not verified)

**Online request tool.** The Privacy Commissioner's **AboutMe** tool drafts and sends a request:
- https://www.privacy.org.nz/your-rights/aboutme-request-my-info-tool/ (not verified)
- This is a likely candidate for an online records request without login. Its form was not inspected.

**Health NZ request pages:**
- Health NZ fact sheet: https://info.health.nz/assets/Privacy/Requesting-Health-Information-Fact-Sheet.pdf (not verified)
- A guessed URL `healthnz.govt.nz/health-services-and-programmes/request-your-health-information` returned **404 (broken)**.

**Complaints about refusal or delay** go to the Privacy Commissioner (https://www.privacy.org.nz/, verified 200).

## 10. Browser-agent notes

Language: English throughout. Te reo Māori headings appear, but the forms work in English.

| Step | Online without login? | Form / channel | Login / ID | Bot wall / CAPTCHA | Notes |
|---|---|---|---|---|---|
| 1. Identify hospital operator | Yes | Static pages | None | None | Map the hospital to one of the 17 Health NZ regions using `/hospitals-services/hospitals`. |
| 2. Complaint to Health NZ | **Yes** (15 of 17 regions) | One-page web form (SilverStripe); Manawatū-Whanganui uses Microsoft Forms; Hawke's Bay is a **PDF/post only** | None | **reCAPTCHA v3 (invisible, score-based)**; no puzzle | **Fields differ per region**, so the agent must read each form. No file upload. Some forms ask for NHI. |
| 3a. Advocacy Service | Yes | Webflow contact form; also phone and email | None | **Cloudflare Turnstile** (usually invisible, can challenge) | Short form; date of birth required. |
| 3b. HDC complaint | **Yes** | **Multi-step Umbraco form (4 to 5 steps)**, file upload, NZ address autocomplete, conditional "on behalf" step, Submit on the last step | None | None detected on step 1 | **Requires NHI.** Cannot save partway. **The AI-content warning** means drafts should stay in the patient's own words and first person, and be reviewed by the patient before they submit. |
| 4. ACC treatment injury claim | **No (patient cannot self-lodge)** | Lodged by a registered health professional (ACC45 + ACC2152) via ProviderHub | Provider login only | acc.co.nz behind **Imperva Incapsula** (blocked curl and WebFetch) | The agent can only draft a request letter to the GP or hospital asking them to lodge. **MyACC** (RealMe or email login, JavaScript app, captcha) is for existing claims only. |
| 4b. ACC review | Partly | ACC33 form (docx) or letter, **emailed** to accreviewapplication@acc.co.nz | None | Incapsula on the site | Within 3 months. Not a web form. |
| 5. Legal aid | No | Application through a lawyer; no public calculator found | None | None | The lawyer finder is online. |
| 6. Find a lawyer (NZLS) | **Yes** | Search with **GET deep links** (`?PracticeAreas=AC&Regions=Canterbury`) | None | Incapsula script present but pages served | Use filter code `AC` for ACC. |
| 7. Guidelines | Partly | HealthPathways mostly **login-restricted** | Clinician login | None | No national scaphoid guideline. |
| 8. Community Law | Yes (lookup) | Location quick-find | None | None | No online enquiry form seen. |
| 9. Records | Probably | Privacy Commissioner "AboutMe" tool (not inspected), or email/letter to Health NZ | None expected | Unknown | 20 working days; free from public agencies. |

**ID systems:**
- **RealMe**: optional route into MyACC; not needed for anything else here.
- **MyACC**: email/password or RealMe; only after a claim exists.
- **NHI number**: not a login, but a **required field** on HDC and some Health NZ forms. The agent must ask the patient for it. It appears on prescriptions, hospital letters, x-ray results and GP portals.

**Bot walls that matter:**
- `acc.co.nz` (Imperva Incapsula). A real headed browser probably gets through, but headless fetches got the stub.
- `legislation.govt.nz` (202/403 challenge).
- `ombudsman.parliament.nz` (403).
- Health NZ forms use invisible reCAPTCHA v3 and the Advocacy Service uses Turnstile. Neither blocks *filling*; both may block automated *submitting*, which we never do.

**Hardest, most impressive browser task: the HDC online complaint form.**
- **Why it is hard:**
  - Server-side multi-step pages with anti-forgery tokens.
  - An NZ address-autocomplete widget (type, then choose a suggestion, then structured fields fill).
  - Multiple required checkbox groups (ethnicity, functional difficulty).
  - A date-picker in DD/MM/YYYY.
  - Conditional branches (on-behalf step, the "tried to resolve directly" details box).
  - A file upload of the hospital's complaint response.
  - It cannot be saved, so it has to be done in one pass.
  - The AI-content caveat means the narrative should come from the patient's own words.
- **Stop at the final "Submit" button on "Tell us about what happened".**
- **Runner-up:** pick the correct one of the 17 Health NZ regional forms for the patient's hospital and adapt to that region's field set. For example, Canterbury's conditional "Complaint" branch versus Auckland's NHI-and-patient-type layout.

## Sources

Verified (HTTP 200 and content read on 2026-11-07, unless noted):
- https://www.healthnz.govt.nz/contact-us/feedback-hospitals (verified)
- https://www.healthnz.govt.nz/hospitals-services/hospitals (verified)
- The 17 regional feedback form URLs in section 2 (all verified 200)
- https://www.hdc.org.nz/making-a-complaint/ (verified)
- https://www.hdc.org.nz/making-a-complaint/make-a-complaint/ (verified)
- https://www.hdc.org.nz/making-a-complaint/make-a-complaint/complaint-form/ (verified)
- https://www.hdc.org.nz/media/iptl32jj/complaint-form-preview.pdf (verified; read as images)
- https://www.hdc.org.nz/making-a-complaint/complaint-process/ (verified)
- https://www.hdc.org.nz/making-a-complaint/how-to-raise-your-concerns-directly/ (verified)
- https://www.hdc.org.nz/making-a-complaint/talk-to-the-advocacy-service/ (verified)
- https://www.hdc.org.nz/your-rights/about-the-code/code-of-health-and-disability-services-consumers-rights/ (verified)
- https://www.hdc.org.nz/media/agwpy53y/factsheet3-timeframesforrespondingtocomplaintsunderright10.pdf (verified)
- https://www.hdc.org.nz/contact-us/ (verified)
- https://www.advocacy.org.nz/ (verified)
- https://www.advocacy.org.nz/contact (verified)
- https://communitylaw.org.nz/community-law-manual/chapter-19-accident-compensation-acc/making-a-claim-and-dealing-with-acc/ (verified)
- https://communitylaw.org.nz/community-law-manual/chapter-19-accident-compensation-acc/when-youre-covered-by-acc-and-when-youre-not/injuries-caused-by-medical-treatment-treatment-injuries/ (verified)
- https://communitylaw.org.nz/community-law-manual/chapter-19-accident-compensation-acc/challenging-an-acc-decision/independent-reviews/ (verified)
- https://communitylaw.org.nz/our-law-centres/ (verified)
- https://www.lawsociety.org.nz/for-the-public/find-a-lawyer/ (verified)
- https://www.lawsociety.org.nz/registry-lookup/ (verified)
- https://www.justice.govt.nz/courts/going-to-court/legal-aid/ (verified)
- https://www.justice.govt.nz/courts/going-to-court/legal-aid/get-legal-aid/ (verified)
- https://www.justice.govt.nz/courts/going-to-court/legal-aid/get-legal-aid/can-i-get-family-or-civil-legal-aid/ (verified)
- https://www.justice.govt.nz/courts/going-to-court/legal-aid/get-legal-aid/legal-aid-lawyer-finder/ (verified)
- https://my.acc.co.nz/login (verified; JavaScript app)
- https://www.acc.co.nz/assets/provider/405074f420/treatment-injury-claim-lodgement-guide.pdf (verified download)
- https://www.hqsc.govt.nz/our-work/system-safety/healing-learning-and-improving-from-harm/ (verified)
- https://www.privacy.org.nz/ (verified)

Not verified (bot wall, or seen only as a search snippet):
- https://www.acc.co.nz/im-injured/injuries-we-cover/treatment-injury (Incapsula)
- https://www.acc.co.nz/for-providers/lodging-claims/lodging-a-claim-for-a-patient (Incapsula)
- https://www.acc.co.nz/im-injured/myacc/about-myacc (Incapsula)
- https://www.acc.co.nz/contact/get-a-decision-reviewed/ (Incapsula)
- https://www.acc.co.nz/assets/general/acc33-application-for-an-independent-review-v2.docx
- https://www.acc.co.nz/assets/provider/acc2152-treatment-injury-claim.doc
- https://www.acc.co.nz/assets/Policy-and-Procedure-documents/Cover-decision-timeframes-policy.pdf
- https://acc.co.nz/assets/Policy-and-procedure-documents/assess-claim-for-cover-_-late-lodged-claim.pdf
- https://www.legislation.govt.nz/act/public/2001/0049/latest/DLM101883.html (403 bot wall)
- https://www.ombudsman.parliament.nz/ (403)
- https://oag.parliament.nz/data/health-reforms/about-health-reform
- https://www.privacy.org.nz/your-rights/aboutme-request-my-info-tool/
- https://www.privacy.org.nz/blog/health-info-the-right-to-know-made-easy/
- https://privacy.org.nz/responsibilities/charging-for-access-to-personal-information/
- https://info.health.nz/assets/Privacy/Requesting-Health-Information-Fact-Sheet.pdf
- https://communitylaw.org.nz/community-law-manual/chapter-19-accident-compensation-acc/challenging-an-acc-decision/appeal-to-district-court-and-higher-courts/
- https://communitylaw.org.nz/free-legal-help/eligibility/
- https://www.advocacy.org.nz/referral
- https://www.hdc.org.nz/media/w0cdfv3i/consumer-consent-executor-consent-form.pdf
- https://wikiMSK.org/wiki/Scaphoid_Fracture

Broken:
- https://www.justice.govt.nz/courts/going-to-court/legal-aid/legal-aid-eligibility-calculator/ (404)
- https://www.healthnz.govt.nz/health-services-and-programmes/request-your-health-information (404)
- https://www.healthnz.govt.nz/contact-us/feedback-and-complaints (404)
- https://bopdhb.health.nz/.../scaphoid-fracture (redirects to a generic page; the scaphoid content is gone)
