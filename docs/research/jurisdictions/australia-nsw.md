# Australia: New South Wales (researched 2026-11-07)

Scope: a patient harmed by care at a **public** hospital (e.g. a missed wrist fracture in A&E) who wants (a) answers and an apology and (b) possibly compensation.
Every fact has an official source link. Mark each URL: verified (fetched, loads) / not verified / broken.

URL status key: **verified** = fetched with curl/WebFetch and returned HTTP 200 with the expected content. **bot-walled** = returns 403 (Cloudflare or similar) to scripted fetches, so the content was confirmed only through search snippets; a real browser probably works. **broken** = 404.

**Route in one line:** raise it with the hospital or its local health district (LHD) using the NSW Health or LHD online feedback form -> escalate to the Health Care Complaints Commission (HCCC) -> for compensation, sue the LHD in negligence under the Civil Liability Act 2002 (the claim is defended by the government self-insurer, the Treasury Managed Fund). There is no no-fault scheme, and Legal Aid does not fund medical negligence, so the usual funding is a "no win no fee" solicitor.

## 1. Which body runs the hospital, and how a patient finds out

- NSW public hospitals are run by **15 local health districts (LHDs)** plus some specialty networks. The NSW Ministry of Health (NSW Health) sits above them. Quote: "Six local health districts cover the Sydney metropolitan region, and nine cover rural and regional NSW." Source: https://www.health.nsw.gov.au/lhd/Pages/default.aspx (verified)
  - Metro: Nepean Blue Mountains, Northern Sydney, South Eastern Sydney (SESLHD), South Western Sydney, Sydney (SLHD), Western Sydney.
  - Regional and rural: Central Coast, Far West, Hunter New England, Illawarra Shoalhaven, Mid North Coast, Murrumbidgee, Northern NSW, Southern NSW, Western NSW.
  - Each LHD has a page at `https://www.health.nsw.gov.au/lhd/pages/<code>.aspx`, e.g. `seslhd.aspx`, `sydlhd.aspx` (not individually verified).
- **How to find the LHD for a hospital:** there is no suburb or postcode lookup tool.
  - LHD maps: https://www.health.nsw.gov.au/lhd/Pages/lhd-maps.aspx (verified) and the wall map PDF https://www.health.nsw.gov.au/lhd/Documents/lhd-wall-map.pdf (verified).
  - "Find your nearest public hospital": https://parking.health.nsw.gov.au/ (verified loads; it is not confirmed whether results show the LHD).
  - Easiest in practice: the NSW Health feedback form's "Hospital / Health service" dropdown lists every facility (see section 2), and each LHD site lists its own hospitals. For example, SLHD runs Royal Prince Alfred, Concord, Canterbury and Balmain; SESLHD runs Prince of Wales, St George, Sutherland, Sydney/Sydney Eye and the Royal Hospital for Women.
- **Who pays compensation:** LHDs are insured by the **Treasury Managed Fund (TMF)**, the NSW Government's self-insurance scheme, managed by icare. https://www.icare.nsw.gov.au/government-agencies/our-funds-and-schemes/treasury-managed-fund (verified loads). The defendant in a claim is normally the LHD.

## 2. Complaint to the provider

- **Statewide policy:** NSW Health Complaint Management Policy PD2020_013. https://www1.health.nsw.gov.au/pds/ActivePDSDocuments/PD2020_013.pdf (verified, PDF)
- **NSW Health patient concerns hub:** https://www.health.nsw.gov.au/patientconcerns/Pages/default.aspx (verified). Quotes:
  - "The care you or your loved ones receive will not be affected by giving feedback."
  - "you can ask a family member, carer or advocate to raise feedback on your behalf."
- **Response times:** from https://www.health.nsw.gov.au/patientconcerns/Pages/our-response.aspx (verified):
  - "We will let you know that we have received your complaint within 5 working days."
  - "You will hear back with an outcome within 35 working days."
  - "If it takes longer, we will explain why and keep you updated."
  - Escalation: you can "ask for your complaint to be reviewed by a higher level of the health service" or "contact any of the independent organisations" (the HCCC).
  - **No deadline for lodging a complaint** is stated on NSW Health pages.
- **Option A: the NSW Health central online feedback form (no login)**
  - Host page: https://www.health.nsw.gov.au/Pages/feedback.aspx (verified). The form is in an iframe whose source is **https://webforms.powerappsportals.com/Feedback/** (verified, Microsoft Power Pages).
  - Quote from the host page: "If your feedback is patient related, please specify the name of the hospital/facility and patient's full name and address."
  - Fields seen in the HTML:
    - Feedback type: Ask a question / Make a complaint / Send a compliment / Make a suggestion about the NSW Health Website / Enquire about a NSW Health Job.
    - Feedback regarding: Hospital / Health Service, Policy Matter or Other.
    - Hospital / Health service: a long dropdown of every NSW public facility.
    - Full name, Email, Phone number, Message.
    - "Would you like us to respond?"
    - A hidden honeypot field ("Leave this field blank").
  - No file upload was seen.
  - **CAPTCHA: Google reCAPTCHA, invisible, attached to the Submit button.** It fires only on Submit, so it does not block an agent that stops before Submit.
  - Data handling: "collected and held by the NSW Ministry of Health ... may be shared with other entities in the NSW public health system".
- **Option B: an LHD's own form.** Example: Sydney LHD "Your feedback matters" form, https://www.slhd.nsw.gov.au/feedback/default.html (verified).
  - Fields: Your Name*, Email address*, Phone, Feedback type* (Pay a compliment / Make a complaint / General feedback), Share your feedback*, "Where did this occur?" (RPA, Concord, Canterbury, Balmain, Mental Health, RPA Virtual, Community Health, Other), "Would you like a response?"*.
  - The form is `multipart/form-data`.
  - **Visible Google reCAPTCHA v2 checkbox** before Submit, plus a math-sum captcha validator in the JS.
  - No login.
- **Other LHDs:**
  - SESLHD has **no online complaint form** as far as found. Its page https://www.seslhd.health.nsw.gov.au/concerns-about-your-health-care (verified) gives three steps: tell the Nurse Manager of the department; contact the Hospital Complaints Officer; contact the health service via https://www.seslhd.health.nsw.gov.au/contact-local-health-district (verified). It also points to Care Opinion.
  - Western Sydney LHD: https://www.nsw.gov.au/departments-and-agencies/wslhd/patients-carers-visitors/share-your-feedback (verified loads; content not inspected).
  - Many LHDs (e.g. Hunter New England) send people to the central NSW Health form. Illawarra Shoalhaven uses email (from search results; not verified).
- **Care Opinion Australia:** a public story and feedback platform, not a formal complaint, which many LHDs monitor. https://www.careopinion.org.au/ (verified)

## 3. Escalation: ombudsman or regulator

**Health Care Complaints Commission (HCCC).** This is the independent statutory body for complaints about health services, including public hospitals, and practitioners in NSW. The NSW Ombudsman is not the health route.

- Main site: https://www.hccc.nsw.gov.au (verified). Portal: https://ecomplaints.hccc.nsw.gov.au (verified).
- Raise it with the provider first? The HCCC encourages this but does not require it. Quote: concerns "can often be resolved quickly and effectively by speaking to the provider directly" and suggests contacting a "Patient Liaison Officer or Complaints Officer in a hospital". https://www.hccc.nsw.gov.au/understanding-complaints/tips-for-making-a-complaint/resolving-concerns-about-your-health-care (verified)
- **Time limit to complain:** none found. Neither the FAQ, "who can make a complaint" nor "what can I complain about" states one (checked 2026-11-07).
- "All complaints must be made in writing." Complaints can be anonymous but may be hard to assess.
- **Who can complain:** the patient; a parent or guardian; "a relative, friend or representative chosen by the person concerned". Written authority from the patient helps, and is needed if the HCCC must get records (except where the patient is under 14 or has died). https://www.hccc.nsw.gov.au/understanding-complaints/who-can-make-a-complaint (verified)
- **Timeframes:**
  - "We aim to assess most complaints within 60 days of receiving all necessary information."
  - Review of the assessment decision: "request a review in writing within 28 days".
- **Compensation:** "The Commission is not able to order providers to pay compensation". https://www.hccc.nsw.gov.au/health-consumers/frequently-asked-questions-health-consumers (verified)
- **Possible outcomes:** discontinue (with or without comments), resolve with an assessment officer, assisted resolution by the HCCC Resolution Service, referral back to the public health organisation for local resolution, referral to a professional council, or investigation (which can lead to prosecution by the Director of Proceedings). https://www.hccc.nsw.gov.au/understanding-complaints/possible-complaint-outcomes (verified)
- **Ways to lodge:**
  1. **Online complaint: an account is required.** "Make a Complaint" (https://ecomplaints.hccc.nsw.gov.au/Complaint/) redirects to an Azure AD B2C sign-up/sign-in page at `hccccrmb2c.b2clogin.com` (verified by curl redirect). Account creation asks for Email Address and Password, plus an **image/audio CAPTCHA ("Help us beat the bots")**. It is a portal-specific account, not myID or myGov. Progress is tracked via "My Matters" in the portal.
  2. **Online enquiry: no login.** https://ecomplaints.hccc.nsw.gov.au/Make-an-Enquiry/ (verified).
     - Fields: Title, First/Middle/Last Name, Mobile, Preferred contact method, Email plus Confirm Email, "Name of health service or provider (if known)", "Please describe the nature of your enquiry".
     - Has an **image CAPTCHA with audio option** ("Enter the code from the image") before Submit.
     - Note that an enquiry is not a formal complaint.
  3. **PDF complaint form** (post or email): https://www.hccc.nsw.gov.au/ArticleDocuments/293/HCCC%20-Complaint%20form%20-%20Sept%202020.pdf.aspx (verified). PDF forms exist in 20+ other languages; the online form is English only.
  4. **Phone:** 1800 043 159 (toll-free in NSW) or (02) 9219 7444. Email hccc@hccc.nsw.gov.au. Post: Locked Mail Bag 18, Strawberry Hills NSW 2012. The HCCC can help write the complaint.
- **Practitioner regulation (Ahpra):** Ahpra is **not** the route for NSW practitioners. Its "Raise a concern" page says: "There are different arrangements for students and health practitioners practising in Queensland and New South Wales", and sends NSW concerns to the HCCC and the NSW Health Professional Councils Authority (HPCA). https://www.ahpra.gov.au/Notifications/Raise-a-concern.aspx (verified).
  - Ahpra's online form, https://portal.ahpra.gov.au/s/rac (redirects to /portal/s/rac, verified loads), is for other states.
  - HPCA: https://www.hpca.nsw.gov.au/complaints/complaints-taking-a-closer-look (verified). Medical Council of NSW: https://www.mcnsw.org.au/ (verified).
  - For an individual patient, the HCCC is the single front door for both service and practitioner complaints.

## 4. Compensation route

**There is no no-fault scheme for treatment injury in NSW.** The route is a common-law negligence claim against the LHD (and/or the practitioner), mostly in the District Court or Supreme Court, governed by the **Civil Liability Act 2002 (NSW)** and the **Limitation Act 1969 (NSW)**.

- Official texts are at https://legislation.nsw.gov.au/view/html/inforce/current/act-2002-022 and https://legislation.nsw.gov.au/view/html/inforce/current/act-1969-031. **Both are bot-walled** (Cloudflare "Just a moment", HTTP 403). AustLII is also Cloudflare-blocked. The statute wording below therefore comes from the Judicial Commission bench books (official) and search snippets.
- **Limitation period:** the Limitation Act 1969 s 50C, Category 3 (personal injury after 6 Dec 2002). "The limitation period is the first to expire of":
  - "the 3 year post discoverability limitation period", and
  - "the 12 year long-stop limitation period" (running from the act or omission).
  - s 50D defines discoverability: when the plaintiff knows, or ought to know, of the injury, that it was caused by the defendant's fault, and that it is serious enough to justify suing.
  - ss 50E and 50F cover minors and disability.
  - s 62A: "12 year period can be extended for maximum of 3 years from date of discoverability, but 3 year period cannot be extended".
  - Source: https://www.judcom.nsw.gov.au/publications/benchbks/civil/limitations.html (verified)
- **Standard of care:** CLA s 5O, the peer professional opinion defence. A professional is not negligent if they acted in a way "widely accepted in Australia by peer professional opinion as competent professional practice", unless the court finds that opinion irrational. Otherwise ss 5B and 5C apply (foreseeability, a "not insignificant" risk). The text is from secondary sources; the statute page is bot-walled.
- **Damages thresholds and caps:**
  - **Non-economic loss (CLA s 16):** none is payable unless the injury is assessed at **at least 15% of a most extreme case**. Between 15% and 33% a sliding table gives sharply reduced percentages (15% severity = 1% of the maximum).
  - **Maximum non-economic loss:** $350,000 in the Act, indexed under s 17 to **$761,500 from 1 Oct 2024** (Judicial Commission, verified: https://www.judcom.nsw.gov.au/publications/benchbks/civil/monetary_jurisdiction.html). Search results report **$804,000 from 1 Oct 2025** under the Civil Liability (Non-economic Loss) Amendment Order 2025 (not verified from the official text).
  - **Practical effect:** a missed scaphoid fracture with a good recovery often falls under the 15% threshold, so general damages may be nil and only economic loss (wages, care, medical costs) is claimable. This makes small claims uneconomic.
- **Court:** the District Court's general jurisdiction limit is $1,250,000 (since 16/12/2022). Larger claims go to the Supreme Court. Source: the Judicial Commission bench book above.
- **Pre-action:** there is no mandatory statutory pre-action protocol for medical negligence in NSW (not verified against a primary source; secondary sources only). In practice the solicitor gets records and expert reports and sends a letter of claim to the LHD, whose claim is handled for the TMF by icare's claims manager.
- **Apology:** CLA Part 10 (ss 67–69) makes an apology inadmissible as an admission of fault. It is widely cited, but the bot-walled statute was not fetched (not verified).

## 5. Funding

- **Legal Aid NSW does not fund medical negligence.** Policy 4.20, "Matters for which legal aid is not available", says legal aid is not available for "matters involving medical negligence or public liability". There is no exception for medical negligence; personal injury generally has a narrow exception only where aid is available under another policy. https://www.legalaid.nsw.gov.au/for-lawyers/policy-online/civil-policies/matters-for-which-legal-aid-is-not-available (verified)
- **Online eligibility checker (no login):** the Legal Aid NSW Means Test Indicator, https://www.legalaid.nsw.gov.au/ways-to-get-help/apply-for-legal-aid/means-test-indicator/standard-means-test-indicator (verified). It is irrelevant here because of the policy exclusion, but it is a good login-free form.
- **No win no fee:** allowed as a "Conditional Costs Agreement". From the Law Society of NSW:
  - "An agreement, where you pay your solicitor only if there is a successful outcome, is called a 'Conditional Costs Agreement'."
  - The uplift "can be up to 25 per cent of the costs, excluding disbursements".
  - Source: https://www.lawsociety.com.au/for-the-public/going-court-and-working-with-lawyers/solicitor-client-relationship/how-solicitors-charge-their-clients (verified loads)
  - **Percentage-of-damages contingency fees are prohibited** in NSW under Legal Profession Uniform Law s 183 (secondary sources; statute not fetched).
- **Small-claim costs cap:** a cap on recoverable legal costs for personal-injury damages of $100,000 or less is commonly cited (Legal Profession Uniform Law Application Act 2014 Sch 1). Not verified.

## 6. Finding a lawyer

- **Law Society of NSW Register of Solicitors / Find a lawyer**
  - https://www.lawsociety.com.au/register-of-solicitors (verified). Also reached via https://www.lawsociety.com.au/find-lawyer and https://www.lawsociety.com.au/public/findalawyer (both redirect, verified).
  - The search app is an iframe at **https://ros.lawsociety.com.au/?tab=lawyer&tab=practice&tab=mediator** (verified).
  - **Lawyer tab fields:** Last Name (Exact / Contains / Begins with), Other Name, Suburb, Region (select), **Accredited Specialist** (select), page size.
  - **Practice tab fields:** Name, Suburb, Region, Type, Limit search to (All, Main or Branch offices), Language other than English.
  - There is also a Mediator/ADR tab.
  - **No CAPTCHA and no login** were seen in the HTML. The dropdown options load by JS.
  - Note from an older URL: `https://www.lawsociety.com.au/find-a-lawyer` is **broken (404)**.
- **Specialist accreditation:** "Personal Injury" is one of the accredited specialist areas. There is no separate "medical negligence" specialty.
  - Quote: "Narrow your search by specifying the area of law" using the Accredited Specialist drop-down.
  - Specialists show "Acc Spec (area of law)" after their name.
  - Source: https://www.lawsociety.com.au/for-the-public/going-court-and-working-with-lawyers/specialist-accreditation-scheme (verified)
- **Law Society Solicitor Referral Service:** linked from the register page as the fallback. Registry phone: 02 9926 0333.

## 7. Clinical guidelines body

- **NSW Agency for Clinical Innovation (ACI), Emergency Care Institute (ECI)**, clinical tool "Scaphoid fracture": https://aci.health.nsw.gov.au/networks/eci/clinical/tools/scaphoid-fracture. **Bot-walled** (403 to curl and WebFetch); the content was seen only through search snippets.
  - Snippets: first published June 2016, minor revision August 2025, next review 2029.
  - Management depends on whether the fracture is displaced or non-displaced; "Immobilise in emergency department (ED), e.g. thumb spica"; consult orthopaedics for the plan and fracture clinic follow-up.
  - Proximal pole fractures carry avascular necrosis risk; missed or undertreated fractures can lead to non-union and osteoarthritis.
  - The exact wording of the pathway for a suspected fracture with a normal X-ray was **not confirmed**.
- **Comparator** (Victoria, not NSW, but a widely used Australian guideline): Royal Children's Hospital "Scaphoid Fractures – Emergency Management", https://www.rch.org.au/clinicalguide/guideline_index/fractures/Scaphoid_Fractures_–_Emergency_Management/ (not verified). For a clinically suspected scaphoid fracture not shown on plain X-ray: immobilise, then fracture clinic review within 1–2 weeks with a repeat X-ray; MRI if tenderness persists. This matches standard Australasian practice of immobilising and re-imaging at 7–14 days.
- Parent index: https://aci.health.nsw.gov.au/networks/eci/clinical/tools/orthopaedic-and-musculoskeletal (bot-walled).

## 8. Free advice and advocacy

- **HCCC Inquiry Line**, 1800 043 159: free help working out whether and how to complain, including help writing the complaint.
- **Hospital Patient Liaison Officers / Complaints Officers:** in each LHD, reached via the hospital switchboard.
- **Health Consumers NSW does NOT do individual advocacy.** Quote: "We do not offer a personal advocacy service and we don't handle personal complaints about a health service you received." It refers people to the provider, the HCCC, Ahpra or Care Opinion. https://hcnsw.org.au/for-patients-carers-families/feedback-and-complaints/ (verified)
- **LawAccess NSW:** free legal information and referral run by Legal Aid NSW. Phone 1300 888 529, Mon–Fri 9am–5pm, with web chat on legalaid.nsw.gov.au. Details come from search results; the guessed URL https://www.legalaid.nsw.gov.au/contact-us/lawaccess-nsw is broken (404). Home page: https://www.legalaid.nsw.gov.au (verified).
- **Community Legal Centres NSW:** https://clcnsw.org.au (not verified).

## 9. Medical records access

- The legal basis is the **Health Records and Information Privacy Act 2002 (HRIP Act)**. The GIPA Act is used only in exceptional cases.
- **Apply to the hospital's Medical Records / Health Information Service:** usually by PDF form sent by email or post, with ID. Generally there is no online form.
- **Example: SESLHD.** https://www.seslhd.health.nsw.gov.au/services-clinics/directory/right-to-information/accessing-personal-health-information (verified)
  - Apply in writing, "preferably on the an Application To Access Personal Health Information Form". Form PDF: https://www.seslhd.health.nsw.gov.au/sites/default/files/groups/Executive_Services/Application%20to%20Access%20Personal%20Health%20Information.pdf (verified)
  - Email per facility, e.g. Prince of Wales: SESLHD-POW-ROI@health.nsw.gov.au.
  - ID is needed for both patient and applicant.
  - Each facility "aims to process applications within 28 working days".
- **Fees:** under NSW Health policy PD2006_050, https://www1.health.nsw.gov.au/pds/ActivePDSDocuments/PD2006_050.pdf (verified). Hospital forms cite around $33 for a copy, with lower fees for concession card holders (from search results; not verified).
- NSW Health Privacy Manual for Health Information: https://www.health.nsw.gov.au/policies/manuals/Documents/privacy-manual-for-health-information.pdf (verified)
- **If refused:** ask the agency for internal review, then go to the Information and Privacy Commission NSW (fact sheet https://www.ipc.nsw.gov.au/node/2810, not verified: it timed out). The HCCC "is unable to retrieve your health information for you".
- The Sydney LHD records page https://slhd.health.nsw.gov.au/patients-visitors/access-your-health-information timed out (not verified).

## 10. Browser-agent notes

| Step | Public website, no login? | Form type | Login / ID | CAPTCHA / bot wall |
|---|---|---|---|---|
| Find LHD for a hospital | Yes | Static pages, maps, plus the hospital dropdown in the NSW Health form | none | none |
| Complaint to hospital/LHD (central) | **Yes** | Online form at `webforms.powerappsportals.com/Feedback/`, embedded in `health.nsw.gov.au/Pages/feedback.aspx` | none | **Invisible reCAPTCHA on Submit only**, plus a honeypot field |
| Complaint to SLHD | **Yes** | Online form at `slhd.nsw.gov.au/feedback/default.html` | none | **Visible reCAPTCHA v2 checkbox** before Submit |
| Complaint to SESLHD | No form | Phone, email or letter to the Complaints Officer | n/a | n/a |
| HCCC formal complaint | **No** | Online form behind a portal account (or PDF by post/email) | **HCCC portal account** (Azure B2C, email plus password); **not myID/myGov** | **Image/audio CAPTCHA at sign-up** |
| HCCC enquiry | **Yes** | Online form at `/Make-an-Enquiry/` | none | **Image CAPTCHA** before Submit |
| Ahpra notification | Not applicable to NSW practitioners | n/a | n/a | n/a |
| Legal aid eligibility | **Yes** | Means Test Indicator (an online questionnaire) | none | none seen. Pointless for medical negligence (excluded by policy 4.20) |
| Find a lawyer | **Yes** | Search form at `ros.lawsociety.com.au` (iframe), with Accredited Specialist = Personal Injury plus Suburb/Region | none | none seen |
| Records request | No | PDF form plus email, with ID attached | none | n/a |
| Read statutes / guidelines | Partly | legislation.nsw.gov.au, AustLII and aci.health.nsw.gov.au | none | **Cloudflare 403 to scripted fetches**; a headless agent may need a real browser profile or must use secondary sources |

- **No government digital ID is needed anywhere on this route.** myID (formerly myGovID) and myGov are federal, and none of these NSW steps use them. Service NSW accounts are also not needed.
- **Language:** English throughout. HCCC PDF forms are available in 20+ languages, and the NSW Health page mentions interpreters.
- **Hardest, most impressive browser task:** fill the **NSW Health central feedback form**, a Power Pages iframe inside a SharePoint page. The agent must:
  1. Work out which of hundreds of facilities in the long "Hospital / Health service" dropdown is the right hospital (for the persona, e.g. "Prince of Wales Hospital" or "Royal Prince Alfred").
  2. Set Feedback type = "Make a complaint" and Feedback regarding = "Hospital / Health Service".
  3. Write a structured complaint message: what happened, the dates, the missed scaphoid fracture against the ECI guidance, and the remedy wanted (explanation, apology, review of the X-ray follow-up process).
  4. Fill the contact fields, set "Would you like us to respond?" = Yes, and **stop before Submit**. The invisible reCAPTCHA only fires on Submit.
- **Runner-up task:** the HCCC enquiry form. It is login-free, with many fields (title, names, mobile, email confirmation, provider name, narrative), and stops naturally at the image CAPTCHA.
- **Best search task:** the Law Society register with Accredited Specialist = Personal Injury plus the patient's suburb or region. The agent then reads the result list.
- **Blocking issues:**
  1. A formal HCCC complaint online needs an account with email verification and a CAPTCHA. The agent should either draft the text for the patient to paste after signing up, or pre-fill the PDF form.
  2. legislation.nsw.gov.au, AustLII and ACI are Cloudflare-walled to non-browser fetches.
  3. SESLHD has no web form.

## Sources

- NSW Health LHDs: https://www.health.nsw.gov.au/lhd/Pages/default.aspx (verified); maps https://www.health.nsw.gov.au/lhd/Pages/lhd-maps.aspx (verified); wall map https://www.health.nsw.gov.au/lhd/Documents/lhd-wall-map.pdf (verified)
- Find a public hospital: https://parking.health.nsw.gov.au/ (verified)
- NSW Health patient concerns: https://www.health.nsw.gov.au/patientconcerns/Pages/default.aspx (verified); https://www.health.nsw.gov.au/patientconcerns/Pages/feedback.aspx (verified); https://www.health.nsw.gov.au/patientconcerns/Pages/our-response.aspx (verified)
- NSW Health feedback form: https://www.health.nsw.gov.au/Pages/feedback.aspx (verified); iframe https://webforms.powerappsportals.com/Feedback/ (verified)
- Complaint Management Policy PD2020_013: https://www1.health.nsw.gov.au/pds/ActivePDSDocuments/PD2020_013.pdf (verified)
- SLHD feedback form: https://www.slhd.nsw.gov.au/feedback/default.html (verified)
- SESLHD: https://www.seslhd.health.nsw.gov.au/concerns-about-your-health-care (verified); https://www.seslhd.health.nsw.gov.au/contact-local-health-district (verified)
- WSLHD feedback: https://www.nsw.gov.au/departments-and-agencies/wslhd/patients-carers-visitors/share-your-feedback (verified loads)
- Care Opinion: https://www.careopinion.org.au/ (verified)
- HCCC: https://www.hccc.nsw.gov.au (verified); portal https://ecomplaints.hccc.nsw.gov.au (verified); enquiry https://ecomplaints.hccc.nsw.gov.au/Make-an-Enquiry/ (verified); complaint (login redirect) https://ecomplaints.hccc.nsw.gov.au/Complaint/ (verified redirect to B2C sign-in)
- HCCC guidance pages: https://www.hccc.nsw.gov.au/understanding-complaints/make-a-complaint-online (verified); FAQ https://www.hccc.nsw.gov.au/health-consumers/frequently-asked-questions-health-consumers (verified); outcomes https://www.hccc.nsw.gov.au/understanding-complaints/possible-complaint-outcomes (verified); who can complain https://www.hccc.nsw.gov.au/understanding-complaints/who-can-make-a-complaint (verified); resolving concerns https://www.hccc.nsw.gov.au/understanding-complaints/tips-for-making-a-complaint/resolving-concerns-about-your-health-care (verified)
- HCCC PDF complaint form: https://www.hccc.nsw.gov.au/ArticleDocuments/293/HCCC%20-Complaint%20form%20-%20Sept%202020.pdf.aspx (verified)
- Ahpra raise a concern: https://www.ahpra.gov.au/Notifications/Raise-a-concern.aspx (verified); https://portal.ahpra.gov.au/s/rac (verified loads)
- HPCA: https://www.hpca.nsw.gov.au/complaints/complaints-taking-a-closer-look (verified); Medical Council of NSW: https://www.mcnsw.org.au/ (verified)
- icare TMF: https://www.icare.nsw.gov.au/government-agencies/our-funds-and-schemes/treasury-managed-fund (verified)
- Civil Liability Act 2002: https://legislation.nsw.gov.au/view/html/inforce/current/act-2002-022 (bot-walled, 403)
- Limitation Act 1969: https://legislation.nsw.gov.au/view/html/inforce/current/act-1969-031 (bot-walled, 403)
- Judicial Commission limitations bench book: https://www.judcom.nsw.gov.au/publications/benchbks/civil/limitations.html (verified)
- Judicial Commission monetary jurisdiction: https://www.judcom.nsw.gov.au/publications/benchbks/civil/monetary_jurisdiction.html (verified)
- 2025 non-economic loss order: https://legislation.nsw.gov.au/view/pdf/asmade/sl-2025-514 (not verified; bot-walled domain)
- Legal Aid NSW: https://www.legalaid.nsw.gov.au (verified); policy 4.20 https://www.legalaid.nsw.gov.au/for-lawyers/policy-online/civil-policies/matters-for-which-legal-aid-is-not-available (verified); means test indicator https://www.legalaid.nsw.gov.au/ways-to-get-help/apply-for-legal-aid/means-test-indicator/standard-means-test-indicator (verified)
- Law Society costs page: https://www.lawsociety.com.au/for-the-public/going-court-and-working-with-lawyers/solicitor-client-relationship/how-solicitors-charge-their-clients (verified loads)
- Law Society register: https://www.lawsociety.com.au/register-of-solicitors (verified); search app https://ros.lawsociety.com.au/?tab=lawyer&tab=practice&tab=mediator (verified); specialist accreditation https://www.lawsociety.com.au/for-the-public/going-court-and-working-with-lawyers/specialist-accreditation-scheme (verified); https://www.lawsociety.com.au/find-a-lawyer (broken, 404)
- ACI ECI scaphoid fracture: https://aci.health.nsw.gov.au/networks/eci/clinical/tools/scaphoid-fracture (bot-walled, 403)
- RCH scaphoid guideline (Victoria): https://www.rch.org.au/clinicalguide/guideline_index/fractures/Scaphoid_Fractures_–_Emergency_Management/ (not verified)
- Health Consumers NSW: https://hcnsw.org.au/for-patients-carers-families/feedback-and-complaints/ (verified); https://www.hcnsw.org.au (verified)
- SESLHD records: https://www.seslhd.health.nsw.gov.au/services-clinics/directory/right-to-information/accessing-personal-health-information (verified); application PDF https://www.seslhd.health.nsw.gov.au/sites/default/files/groups/Executive_Services/Application%20to%20Access%20Personal%20Health%20Information.pdf (verified)
- Records fees PD2006_050: https://www1.health.nsw.gov.au/pds/ActivePDSDocuments/PD2006_050.pdf (verified)
- NSW Health privacy manual: https://www.health.nsw.gov.au/policies/manuals/Documents/privacy-manual-for-health-information.pdf (verified)
- IPC fact sheet: https://www.ipc.nsw.gov.au/node/2810 (not verified, timed out)
- SLHD records: https://slhd.health.nsw.gov.au/patients-visitors/access-your-health-information (not verified, timed out)
