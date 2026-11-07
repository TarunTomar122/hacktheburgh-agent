# United States: California (researched 2026-11-07)

Scope: a patient harmed by care at a **public** hospital emergency department (missed scaphoid fracture, now needs surgery) who wants (a) answers and an apology and (b) possibly compensation.
URL marks: **verified** = fetched and loads (HTTP 200 or read via WebFetch); **bot-walled** = page exists but returns 403 to scripts; **not verified**; **broken**.

**The route in one line:** hospital grievance (patient-rights office) → CDPH complaint against the hospital (Cal Health Find online form) + Medical Board of California complaint against the doctor (BreEZe online form) → for money: **government claim to the public entity within 6 months** (county or district hospital), 90-day notice of intent (CCP 364), then a lawsuit within 1 year of discovery / 3 years of injury (CCP 340.5). Damages for pain and suffering are capped by MICRA ($470,000 for 2026 per category of defendant). No ombudsman and no no-fault scheme.

## 1. Which body runs the hospital, and how a patient finds out

- "Public hospital" in California covers different owners: a **county** (e.g. LA County Department of Health Services runs LA General), a **University of California** medical center (owned by The Regents), or a **healthcare district**. Which one matters because it decides where the pre-lawsuit government claim goes (section 4).
- **Cal Health Find** (CDPH) lets anyone search a facility by name, type or location and "View provider details, including facility ownership, licensing and certification status ... and performance history (complaints, entity/facility reported incidents, state enforcement actions, and deficiencies)". It also shows the CDPH district office that oversees the hospital. https://www.cdph.ca.gov/Programs/CHCQ/LCP/CalHealthFind/Pages/Home.aspx (**verified**)
- CDPH regulates hospitals; the **Medical Board of California** (MBC) licenses doctors. CDPH: "CDPH does not license medical doctors (MDs) ... File complaints against these professional classifications with the appropriate regulatory agencies: Medical Board of California". https://www.cdph.ca.gov/Programs/CHCQ/LCP/CalHealthFind/Pages/ComplaintInvestigationProcess.aspx (**verified**)

## 2. Complaint to the provider

- Federal Medicare rules (every hospital taking Medicare) require a grievance process. 42 CFR 482.13(a)(2): the hospital must "establish a process for prompt resolution of patient grievances", with "a clearly explained procedure for the submission of a patient's written or verbal grievance", must "specify time frames for review of the grievance and the provision of a response", and must give a **written notice** of its decision naming the contact person, the steps taken to investigate, the results and the completion date. https://www.law.cornell.edu/cfr/text/42/482.13 (**verified**). Official eCFR copy https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-482/subpart-B/section-482.13 (**bot-walled**, redirects scripts to unblock.federalregister.gov).
- No state-wide online form: each hospital runs its own (usually a "Patient Relations" / "Patient Advocate" phone line, email or web form; some need a patient-portal login such as MyChart). The agent must find the hospital's own "patient rights" or "grievance" page.
- CMS guidance (State Operations Manual Appendix A, tag A-0123) says a 7-day response is typical and that patients can complain to the state agency without using the hospital process first (**not verified**; from memory, check before relying).

## 3. Escalation: regulator (no ombudsman for hospitals)

### 3a. CDPH complaint against the hospital (best online form)
- CDPH: "Anyone can file a complaint against a health-care facility ... Filing a complaint through the California Health Facilities Information Database (Cal Health Find) is the most direct way. You file the complaint and it is routed directly to the district office". Also by letter, fax or phone to the district office. https://www.cdph.ca.gov/Programs/CHCQ/LCP/Pages/FileAComplaint.aspx (**verified**)
- **Online form, no login**: https://www.cdph.ca.gov/Programs/CHCQ/LCP/CalHealthFind/Pages/Complaint.aspx (**verified**). Single page. Fields seen in the HTML: Facility Name (type-ahead "Enter Facility Name or City", which fills facility type, address and L&C district office); "Do you prefer to remain anonymous? *"; Name, Email, Phone, Mailing Address (100 chars); "Does your complaint involve a specific patient or resident? *"; "Is the patient or resident still in the facility/under the provider's care? *"; "What is your relationship to the patient or resident? *"; Patient Full Name *; Date of Alleged Event *; Time; "Describe the Event: *" (max **5000 characters**); attachment (.DOC, .DOCX, .RTF, .TXT, .PDF, .PPT, .JPEG, .PNG, max 20 MB). The page says: "To keep a record of this complaint, please click on the 'print' button prior to clicking 'submit'." **A Google reCAPTCHA v2 widget** (`class="g-recaptcha"`, `id="divRecaptcha"`) sits before Submit.
- Paper form CDPH 528: https://www.cdph.ca.gov/CDPH%20Document%20Library/ControlledForms/cdph528.pdf (**verified**). District offices: https://www.cdph.ca.gov/Programs/CHCQ/LCP/Pages/DistrictOffices.aspx (**verified**)
- Timing: only urgent hospital cases have a fixed deadline: "Complaint investigations involving general acute care hospitals ... must be completed within 45 days if the allegation indicates an ongoing threat of imminent danger of death, or serious bodily harm. The district office will notify you of the results in writing". A missed fracture is not immediate jeopardy, so there is no fixed deadline. No filing time limit stated.
- Outcome: findings, a Statement of Deficiencies (Form 2567) and possibly penalties against the hospital. **No compensation.**

### 3b. Medical Board of California complaint against the ED doctor
- "If you wish to submit a complaint, you can submit online through the BreEZe online system". Covers "Quality of Care (Misdiagnosis, ...". "the Board cannot assist with any coordination of patient care or provide financial compensation." "You must fill out a separate complaint form for each physician". https://www.mbc.ca.gov/Consumers/file-a-complaint/ (**verified**); process https://www.mbc.ca.gov/Consumers/File-a-Complaint/complaint-process.aspx (**verified**); BreEZe instructions https://www.mbc.ca.gov/Resources/BreEZe-Resources-Center/Complaints.aspx (**verified**): "Continue to BreEZe Online Services", then "Click the **File a Complaint** button located under the Consumers heading." "A complaint can be filed anonymously".
- **BreEZe consumer complaint: no account needed.** The BreEZe home https://www.breeze.ca.gov/datamart/mainMenu.do (**verified**, redirects to loginCADCA.do and needs cookies) has a "FOR CONSUMERS: Check Licenses and file complaints" button pointing to `complaint.do?load=true?from=loginPage`. Fetched **with** the session cookie and Referer it returns the form; fetched cold it returns **401 "Access is denied"**, so the agent must click through from the home page. Page 1 fields: "* Board" (drop-down; pick "Medical Board of California"), "* License Type", "Incident Date or Contact Date (mm/dd/yyyy)", "* Complaint Description", "* Expected Resolution", Documents (upload), "Submitted to Other Agencies: Yes / No". Multi-page (Next / Previous / Cancel). The **licensee login** box on the home page has **Cloudflare Turnstile**; the complaint page I fetched had no CAPTCHA (later pages not checked).
- Medical-records release forms to attach: https://mbc.ca.gov/Resources/BreEZe-Resources-Center/Authorizations-for-Release-of-Information.aspx (**verified**). Phone (800) 633-2322. Doctor licence lookup: https://search.dca.ca.gov/ (**verified**).
- MBC must prove a violation by "clear and convincing evidence". Patients may send an impact statement "up to 60 (sixty) days following receipt of the notification".

### 3c. Other channels (secondary)
- The Joint Commission (accreditor) takes public complaints online: https://jointcommission.org/resources/patient-safety-topics/report-a-patient-safety-concern-or-complaint/ (**bot-walled**, 403 to scripts and WebFetch; may block automated browsers too).
- Medicare patients only: the BFCC-QIO (Livanta, which CMS now lists as "Commence Health") handles quality-of-care complaints. https://www.cms.gov/bfcc (**verified**); https://www.livantaqio.cms.gov/ (**bot-walled**).
- HMO members: the Department of Managed Health Care (DMHC) handles complaints about the health plan, not about hospital negligence. https://www.dmhc.ca.gov/FileaComplaint.aspx (**bot-walled**).

## 4. Compensation route (fault-based lawsuit; no no-fault scheme)

1. **Government claim first (public hospital).** Gov. Code 911.2(a): a claim for "injury to person ... shall be presented ... not later than **six months** after the accrual of the cause of action." No lawsuit can be filed until the claim is rejected or deemed rejected (Gov. Code 945.4, **not verified**). After a written rejection there are 6 months to sue (Gov. Code 945.6, **not verified**). Source for 911.2: https://codes.findlaw.com/ca/government-code/gov-sect-911-2/ (**verified** via WebFetch; 403 to curl).
   - **County hospital (LA example):** "A signed, written claim" by post or in person to the Executive Officer, Board of Supervisors, Attention: Claims, 500 W. Temple Street, Room 383, Los Angeles, CA 90012. No online filing. "Return the original in person or US Mail." Deadline: 6 months for injury. https://bos.lacounty.gov/claims-for-damages (**verified**); PDF form linked there.
   - **State-run facility:** DGS Government Claims Program, online form on a third-party (Ventiv) site plus a **$25 fee** (fee waiver possible) or paper form DGS ORIM 006. https://www.dgs.ca.gov/ORIM/File-a-Claim (**verified**); https://www.dgs.ca.gov/-/media/Divisions/ORIM/Resources/Government-Claim-Form.pdf (**verified**).
   - **UC medical centers:** The Regents are reported to be **exempt** from the claim-filing rules (Gov. Code 905.6), per UC risk-management pages found in search; treat 6 months as the safe deadline anyway (**not verified** from a primary source).
2. **Notice of intent, CCP 364.** "No action based upon the health care provider's professional negligence may be commenced unless the defendant has been given at least 90 days' prior notice of the intention to commence the action." "No particular form of notice is required", but it must state "the legal basis of the claim and the type of loss sustained, including with specificity the nature of the injuries suffered." If served within the last 90 days before the limitation period ends, the period is "extended 90 days from the service of the notice." https://codes.findlaw.com/ca/code-of-civil-procedure/ccp-sect-364/ (**verified** via WebFetch).
3. **Limitation, CCP 340.5.** "three years after the date of injury or one year after the plaintiff discovers, or through the use of reasonable diligence should have discovered, the injury, whichever occurs first" (wording per FindLaw summary). Exceptions extend the 3 years only for fraud, intentional concealment or a foreign body. https://codes.findlaw.com/ca/code-of-civil-procedure/ccp-sect-340-5/ (**verified** via WebFetch). Official: https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CCP&sectionNum=340.5 (**bot-walled**, 403).
   - For this case: the patient usually discovers the missed fracture when follow-up imaging shows it, so the **1-year clock** (and the **6-month government-claim clock**) start then.
4. **MICRA cap (Civil Code 3333.2, as amended by AB 35, in force 1 Jan 2023).** Non-death cases: noneconomic damages against health care providers "collectively ... shall not exceed three hundred fifty thousand dollars ($350,000)", with a separate $350,000 for health care institutions collectively (and a third for unaffiliated defendants). It "shall increase by forty thousand dollars ($40,000) each January 1st" for 10 years up to $750,000, then 2% a year from 2034. So **2026: $470,000** (per category; the hospital and the doctors can be two categories). Wrongful death: $500,000 rising $50,000 a year to $1,000,000 (2026: $650,000). Economic losses (surgery, lost wages) are **not capped**. https://codes.findlaw.com/ca/civil-code/civ-sect-3333-2/ (**verified** via WebFetch); schedule check: https://www.milliman.com/id-ID/insight/How-will-AB-35-affect-MICRA-and-non-economic-damage-caps (**not verified**, search result only).

## 5. Funding

- Medical negligence cases run on **contingency fees**. BPC 6146 (AB 35) caps the lawyer's fee at "Twenty-five percent of the dollar amount recovered" if settled before a lawsuit or arbitration demand is filed, and "Thirty-three percent" after filing; a court may allow more after trial "on a showing of good cause". https://codes.findlaw.com/ca/business-and-professions-code/bpc-sect-6146/ (**verified** via WebFetch).
- Civil legal aid in California rarely takes malpractice cases (they are contingency cases). Legal-aid finder by city, county or ZIP, no login or CAPTCHA seen: https://www.lawhelpca.org/ (**verified** via WebFetch; curl timed out). No official online eligibility checker for malpractice.
- Court fee waiver forms and self-help: https://selfhelp.courts.ca.gov/ (**verified**).

## 6. Finding a lawyer

- **State Bar Attorney Search, advanced:** https://apps.calbar.ca.gov/attorney/LicenseeSearch/AdvancedSearch (**verified**, plain GET form, no CAPTCHA seen). Fields: Last/First/Middle/Firm name (Sounds like / Contains / Begins with / Is exactly), City, State, Zip, District, County (58 counties + Statewide), **Cert. Legal Specialty** (includes "**Medical Professional Liability***", value 110), Languages Spoken (~100), **Self-Reported Practice Areas** (includes "**Medical Malpractice**", value 46, and "Personal Injury"), plus a required **disclaimer checkbox** when using practice areas ("the State Bar of California does not verify the accuracy of self-reported practice areas"). The location search gives "a random sample listing of attorneys". The asterisk marks specialties certified by outside providers accredited by the State Bar. A crafted GET URL returned "Some field(s) have invalid selection(s)", so the agent should fill the form in the UI.
- Why use a certified specialist: https://www.calbar.ca.gov/Public/Need-Legal-Help/Why-Use-a-Certified-Legal-Specialist (**verified**).
- **Certified Lawyer Referral Services:** search "by county, area of law, and languages spoken" (a Power BI report), plus a PDF list https://www.calbar.ca.gov/sites/default/files/2026-07/Certified-Legal-Referral-Services.pdf (**verified**) and regional pages. "the State Bar is not a Lawyer Referral Service and cannot direct you to a lawyer". https://www.calbar.ca.gov/Public/Need-Legal-Help/Certified-Lawyer-Referral-Services-Directory (**verified**). Phone 866-442-2529.

## 7. Clinical guidelines body

- The US has no single national guideline body like NICE. Radiology standard: **ACR Appropriateness Criteria, "Acute Hand and Wrist Trauma"** (new 2018; J Am Coll Radiol 2019;16(5S):S7-S17). **Variant 2:** "Suspect acute hand or wrist trauma. Initial radiographs negative or equivocal. Next imaging study." Rated **Usually Appropriate**: "Radiography area of interest repeat in 10-14 days", "MRI area of interest without IV contrast", "CT area of interest without IV contrast". https://acsearch.acr.org/docs/69418/Narrative/ (**verified**); PDF https://acsearch.acr.org/list/TopicNarrativePdf?topicId=77 (**verified**, text could not be extracted). In practice this supports the claim that a clinically suspected scaphoid fracture with normal X-rays should be immobilised and re-imaged rather than discharged.

## 8. Free advice and advocacy

- **Health Consumer Alliance** (state-funded network of legal-services groups): free help with coverage and medical bills, 888-804-3536, many languages. https://healthconsumer.org/ (**verified**). It does not handle negligence claims.
- Hospital patient advocates (in-house) and LawHelpCA (section 5).

## 9. Medical records access

- **California, HSC 123110:** inspection "within five working days after receipt of the request"; copies "transmitted within 15 days after receiving the request"; paper copies capped at "twenty-five cents ($0.25) per page"; fees must be "reasonable, cost-based". Request must be **in writing**. https://california.public.law/codes/health_and_safety_code_section_123110 (**verified**; secondary copy, the official leginfo page is bot-walled).
- **Federal HIPAA right of access (45 CFR 164.524):** up to 30 days (one 30-day extension), electronic copy if held electronically. HHS guidance https://www.hhs.gov/hipaa/for-individuals/medical-records/index.html (**bot-walled**, 403). Complaints to HHS Office for Civil Rights portal https://ocrportal.hhs.gov/ocr/smartscreen/main.jsf (**verified**; login not checked).
- Most large systems also let patients download records through a portal (e.g. MyChart), which needs the patient's own login.

## 10. Browser-agent notes

| Step | Public website, no login? | How | Blockers |
|---|---|---|---|
| Find the hospital's owner + district office | Yes | Cal Health Find search | none seen |
| Hospital grievance | Varies | each hospital's own page, form or email; some need a patient portal | site-specific; may need MyChart |
| CDPH complaint | **Yes, online form** | Cal Health Find Complaint.aspx, one page, 5000-char description, upload | **reCAPTCHA v2** before Submit (stop there anyway) |
| MBC complaint against doctor | **Yes, online form** | BreEZe "File a Complaint" for consumers, multi-page | must click through from the home page (cold deep link returns 401); Turnstile on the login box only (complaint pages after page 1 not checked) |
| Government claim (county) | No | paper PDF, post or hand delivery | signature required |
| Government claim (state) | Online with no login seen | DGS → Ventiv portal | $25 fee or fee waiver; third-party site |
| CCP 364 notice | No form | letter drafted by agent, posted by patient | none |
| Find a lawyer | **Yes** | State Bar Advanced Search (specialty "Medical Professional Liability", county, language) | disclaimer checkbox for practice areas |
| Lawyer referral service | Yes | Power BI report / PDF list | Power BI iframe is clumsy to drive |
| Legal aid finder | Yes | LawHelpCA by ZIP | none seen |
| Records | No form | written request letter (HSC 123110); portal needs patient login | none |
| Statutes | Read-only | leginfo.legislature.ca.gov is **bot-walled** (403); use FindLaw / public.law | 403 |

- Language: English; CDPH and MBC paper forms also in Spanish.
- Login/ID: none of the core steps need a government ID login. California has no BankID or FranceConnect equivalent.
- **Hardest, most impressive task:** look up the hospital in Cal Health Find (owner, licence, district office, past deficiencies), then fill the **CDPH Cal Health Find complaint** (facility type-ahead, Yes/No radios, relationship, date, a 5000-character factual narrative, attach the discharge letter), stopping at the reCAPTCHA / Submit. Then, in the same run, navigate BreEZe from its home page → "File a Complaint" → Board = Medical Board of California → licence type → description → Expected Resolution, stopping before Submit; and finally work out the **6-month government-claim deadline** from the discovery date and fill the county claim PDF.
- Deadlines to compute for the patient: government claim **6 months** from discovery (public entity); lawsuit **1 year from discovery / 3 years from injury**, whichever is first; CCP 364 notice at least **90 days** before suing.

## Sources

- CDPH File a Complaint https://www.cdph.ca.gov/Programs/CHCQ/LCP/Pages/FileAComplaint.aspx (verified)
- Cal Health Find home https://www.cdph.ca.gov/Programs/CHCQ/LCP/CalHealthFind/Pages/Home.aspx (verified)
- Cal Health Find complaint form https://www.cdph.ca.gov/Programs/CHCQ/LCP/CalHealthFind/Pages/Complaint.aspx (verified)
- CDPH complaint investigation process https://www.cdph.ca.gov/Programs/CHCQ/LCP/CalHealthFind/Pages/ComplaintInvestigationProcess.aspx (verified)
- CDPH 528 form https://www.cdph.ca.gov/CDPH%20Document%20Library/ControlledForms/cdph528.pdf (verified)
- CDPH district offices https://www.cdph.ca.gov/Programs/CHCQ/LCP/Pages/DistrictOffices.aspx (verified)
- MBC file a complaint https://www.mbc.ca.gov/Consumers/file-a-complaint/ (verified)
- MBC complaint process https://www.mbc.ca.gov/Consumers/File-a-Complaint/complaint-process.aspx (verified)
- MBC BreEZe complaints help https://www.mbc.ca.gov/Resources/BreEZe-Resources-Center/Complaints.aspx (verified)
- MBC release authorisations https://mbc.ca.gov/Resources/BreEZe-Resources-Center/Authorizations-for-Release-of-Information.aspx (verified)
- BreEZe https://www.breeze.ca.gov/datamart/mainMenu.do (verified, needs cookies)
- DCA licence search https://search.dca.ca.gov/ (verified)
- 42 CFR 482.13 https://www.law.cornell.edu/cfr/text/42/482.13 (verified); eCFR (bot-walled)
- Gov. Code 911.2 https://codes.findlaw.com/ca/government-code/gov-sect-911-2/ (verified via WebFetch)
- CCP 364 https://codes.findlaw.com/ca/code-of-civil-procedure/ccp-sect-364/ (verified via WebFetch)
- CCP 340.5 https://codes.findlaw.com/ca/code-of-civil-procedure/ccp-sect-340-5/ (verified via WebFetch)
- Civil Code 3333.2 https://codes.findlaw.com/ca/civil-code/civ-sect-3333-2/ (verified via WebFetch)
- BPC 6146 https://codes.findlaw.com/ca/business-and-professions-code/bpc-sect-6146/ (verified via WebFetch)
- HSC 123110 https://california.public.law/codes/health_and_safety_code_section_123110 (verified)
- leginfo (official codes) https://leginfo.legislature.ca.gov/ (bot-walled, 403)
- LA County claims https://bos.lacounty.gov/claims-for-damages (verified)
- DGS Government Claims https://www.dgs.ca.gov/ORIM/File-a-Claim (verified)
- State Bar advanced search https://apps.calbar.ca.gov/attorney/LicenseeSearch/AdvancedSearch (verified)
- State Bar LRS directory https://www.calbar.ca.gov/Public/Need-Legal-Help/Certified-Lawyer-Referral-Services-Directory (verified)
- LawHelpCA https://www.lawhelpca.org/ (verified via WebFetch)
- Courts self-help https://selfhelp.courts.ca.gov/ (verified)
- Health Consumer Alliance https://healthconsumer.org/ (verified)
- ACR Acute Hand and Wrist Trauma https://acsearch.acr.org/docs/69418/Narrative/ (verified)
- HHS OCR portal https://ocrportal.hhs.gov/ocr/smartscreen/main.jsf (verified)
- CMS BFCC-QIO https://www.cms.gov/bfcc (verified)
- Joint Commission complaints https://jointcommission.org/resources/patient-safety-topics/report-a-patient-safety-concern-or-complaint/ (bot-walled)
- DMHC complaints https://www.dmhc.ca.gov/FileaComplaint.aspx (bot-walled)
- HHS records guidance https://www.hhs.gov/hipaa/for-individuals/medical-records/index.html (bot-walled)
