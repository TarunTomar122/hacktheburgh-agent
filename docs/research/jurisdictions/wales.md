# Wales (researched 2026-11-07)

Scope: a patient harmed by care at a **public** hospital (here: the Emergency Unit at University Hospital of Wales, Cardiff, run by Cardiff and Vale University Health Board, missed a scaphoid fracture; the patient now needs surgery) who wants (a) answers and an apology and (b) possibly compensation.
Every fact has an official source link. URL status checked with `curl -sL` (browser user agent) on 2026-11-07: **verified** (fetched, HTTP 200) / **not verified** / **broken**. No form was submitted and no visible browser was opened.

**Route in one line:** raise a "concern" with the health board's concerns team (Listening to People, since 1 April 2026) -> listening discussion -> Stage 1 early resolution (10 working days) or Stage 2 investigation, in which the board must assess "qualifying liability" and may offer **NHS redress up to £50,000** with **free legal advice** -> if unhappy, **Public Services Ombudsman for Wales** -> outside redress, a clinical negligence claim in the courts of England and Wales (3-year limitation, pre-action protocol, no legal aid for adults, no win no fee).

**The big surprise:** "Putting Things Right" (PTR) is **no longer the process for new concerns**. Since **1 April 2026** it is **"Listening to People: NHS Wales Complaints, Incidents and Redress process"**, made by the NHS (Concerns, Complaints and Redress Arrangements) (Wales) (Amendment) Regulations 2025 (S.I. 2025/1099). The redress cap went **from £25,000 to £50,000**. gov.wales: "Concerns raised up to and including 31 March 2026 will continue to be handled via Putting Things Right. Concerns raised after 31 March 2026 should follow the new process via Listening to People". Many third-party pages (AvMA, Betsi Cadwaladr's SmartSurvey form, older health board pages) still describe PTR and £25,000. The agent must not quote £25,000 for a 2026 concern.

## 1. Which body runs the hospital, and how a patient finds out

- NHS Wales hospitals are run by **7 local health boards** (plus all-Wales trusts: Velindre, Welsh Ambulance Service, Public Health Wales). The 7 boards and their concerns pages (all verified 200):
  - Aneurin Bevan UHB (Gwent): https://abuhb.nhs.wales/about-us/complaints-concerns/
  - Betsi Cadwaladr UHB (North Wales): https://bcuhb.nhs.wales/patients-and-visitors/peoples-enquiry-and-resolution-service-pears/
  - Cardiff and Vale UHB: https://cavuhb.nhs.wales/patient-advice/complaints/listening-to-people/
  - Cwm Taf Morgannwg UHB: https://ctmuhb.nhs.wales/contact-us/concerns-complaints/
  - Hywel Dda UHB (West Wales): https://hduhb.nhs.wales/healthcare/services-and-teams/patient-support-services-complaints-feedback/
  - Powys Teaching HB: https://pthb.nhs.wales/contact-us/feedback-and-complaints/
  - Swansea Bay UHB: https://sbuhb.nhs.wales/about-us/complaints-compliments-and-feedback/
- **How a patient finds out:** the Welsh Government leaflet says "Each health board or trust has their own concerns team. To find details for your health board or NHS Wales trust, visit www.nhs.wales/hpb/local-services". That page (verified) lists Health Boards / Trusts / Special Health Authorities in JavaScript-rendered tiles; it has **no postcode search**. NHS 111 Wales "Services near you" (verified) has a postcode/town search with categories including "Hospitals, including Emergency departments and MIUs" and "Health Board Services" (ASP.NET page; categories read from page state, search not run).
- **Our hospital:** University Hospital of Wales (UHW), Heath Park, Cardiff CF14 4XW, is a Cardiff and Vale UHB hospital (address shown on cavuhb.nhs.wales; UHW page https://cavuhb.nhs.wales/hospitals-and-health-centres/our-hospitals/uhw/ verified).
- **Only Welsh NHS bodies can offer redress.** WHC/2026/006: "The duty to consider redress only applies to Welsh NHS bodies ... Local Health Boards, National Health Service Trusts ... or Special Health Authorities. The duty to consider redress does not apply to primary care providers or independent providers". GPs, dentists, pharmacists and optometrists must still investigate and apologise but "cannot offer NHS redress through the Listening to People process" (People's guidance p.9-10).

## 2. Complaint to the provider (Listening to People)

**Law:** NHS (Concerns, Complaints and Redress Arrangements) (Wales) Regulations 2011 (S.I. 2011/704) as amended in 2023 and by S.I. 2025/1099 (in force 1 April 2026; reg 24 of the 2025 Regs: they "do not apply to any concern notified ... before" that date).

**Time limit (reg 15):** "a concern must be notified not later than twelve months after— (a) the date on which the matter which is the subject of the concern occurred; or (b) if later, the date on which the matter ... came to the notice of the person notifying the concern." Can be extended for "good reasons" if it can still be investigated "effectively and fairly", but **absolute bar**: "A concern may not be notified three or more years after the date on which the matter ... occurred or, if later, three or more years from the date on which [it] came to the notice of the patient." (reg 15(3))

**Stages (People's guidance 2026 and WHC/2026/006):**
1. Talk to staff on the spot, or contact the board's concerns team. Concerns can be raised "verbally by telephone or in-person or in writing (by letter, on a concern form or electronically)". Boards must advertise "a single point of access".
2. **Acknowledgement** "no later than 5 working days after the day on which the organisation receives the concern" (People's guidance p.10). (Cardiff and Vale's older page still says 2 working days, the PTR figure.)
3. **Listening discussion:** the organisation "must offer" an in-person, phone or video "listening discussion"; it "is not optional for organisations" (WHC). Advocacy (Llais) and language choice must be offered.
4. **Stage 1 Early Resolution** ("Listen and Act"): "no longer than 10 working days from the date the concern is acknowledged". Redress **cannot** be considered at this stage: "considerations for redress cannot be undertaken in the early resolution stage, as they require detailed investigation." The patient chooses early resolution or investigation.
5. **Stage 2 Investigation** ("Investigate, Respond, and Learn"): written response under reg 24: "A responsible body must take all reasonable steps to send a response ... within thirty working days"; if not, explain why and respond "within six months". The response must include an apology where appropriate, copies of expert opinions and relevant records, and "details of the right to notify the concern to the Public Services Ombudsman for Wales". Where harm is alleged and the board finds **no** qualifying liability it must "give reasons in the response for this decision" (reg 24(2)).
6. Where harm is found or may exist -> the **redress** track (section 4).

Leaflet (gov.wales, 2026): "They will aim to respond to you within 30 working days ... More complex concerns can take up to six months or longer". "You can take up to 12 months".

**Online forms without login (checked 3+ boards):**
| Board | Online form? | Notes |
|---|---|---|
| Cardiff and Vale (our hospital) | **No web form.** | "fill in our Complaints Form, e-mail the team at Cav.Concerns@wales.nhs.uk or write to us". The form is a **bilingual Word .doc** (6 pages: English then Welsh "Ffurflen Pryderon"), sections A Your details / B on behalf of someone else / C details (date, frontline staff already told?, summary, what went wrong, questions, desired outcome) / D contact by email, telephone or letter, plus a signed consent to use health records. Return to Concerns Department, Woodland House, Maes-y-Coed Road, Cardiff CF14 4HH. Phone 029 218 36318. Welsh page: bipcaf.gig.cymru. |
| Powys Teaching HB | **Yes, no login.** | "Submit a Concern" Mura form, **one page**, no file upload, no visible CAPTCHA, but hidden anti-bot fields (honeypot "Leave this field empty", mouse-movement and key-press trackers). Fields: Section A date of event*, provider and department*, already raised with staff?, summary*, questions, best time to call, contact method (Email/Telephone/Letter); Section B full name and title*, DOB*, address and postcode*, phone*, email*, "on behalf of yourself?"* Yes/No; Section C the other person's name, DOB, address, email, relationship. Submit message: "Thank you for submitting a concern." Welsh version linked ("Cymraeg"). |
| Betsi Cadwaladr | **Unclear.** | Current PEARS page lists phone 03000 851 234 and BCU.PEARS@wales.nhs.uk (the mailto link actually points at BCU.PALS@wales.nhs.uk), Mon-Fri 10:00-16:00, and still links to the PTR page. A SmartSurvey "Concerns form (English)" exists at smartsurvey.co.uk/s/bcuhbconcernsform (multi-page, progress bar, "Next Page" button, no login, no CAPTCHA seen), but its text is PTR-era ("arrangements that were in place before 1 April 2011") and it is **not linked from the current PEARS page**. Treat it as legacy. |
| Swansea Bay | **Not determined.** | Listening to People page ends "To raise a concern, you can" and the options are JavaScript tiles that a static fetch cannot read. A search snippet of the board's site gives SBU.Complaints@wales.nhs.uk and 01639 683316 (not verified on the fetched page). Says Welsh correspondence "will be replied to in Welsh". |
| Aneurin Bevan | Word form ("ptr-concerns-form-2024-english-docx"). | Looks like an export of an online form: asks language (English/Welsh/Other) and "Does your concern involve another Health Board?" with a dropdown of the other 6 boards. Page text loads by JavaScript. |

URLs:
- https://www.gov.wales/listening-people-nhs-wales-complaints-incidents-and-redress-process (verified; last updated 4 August 2026)
- https://www.llyw.cymru/gwrando-ar-bobl-proses-cwynion-digwyddiadau-ac-iawn-gig-cymru (verified; Welsh version)
- https://www.gov.wales/sites/default/files/publications/2026-03/listening-to-people-the-nhs-wales-complaints-incidents-and-redress-process-peoples-guidance_0.pdf (verified; People's guidance, 21 pages)
- https://www.gov.wales/sites/default/files/publications/2026-03/listening-to-people-the-nhs-wales-complaints-incidents-and-redress-process-peoples-guidance.pdf (**broken**, 404; the URL without `_0` that search engines return)
- https://www.gov.wales/sites/default/files/publications/2026-06/listening-to-people-leaflet_0.pdf (verified; leaflet)
- https://www.gov.wales/sites/default/files/publications/2026-07/gwrando-ar-bobl-codi-pryder-gwasanaeth-iechyd-yng-nghymru_0.pdf (verified; Welsh leaflet)
- https://www.gov.wales/sites/default/files/publications/2026-03/whc-2026-006-listening-to-people.pdf (verified; Welsh Health Circular)
- https://www.gov.wales/listening-people-nhs-wales-complaints-incidents-and-redress-process-organisations (verified; organisational guidance, 103 pages)
- https://www.gov.wales/nhs-wales-complaints-and-concerns-putting-things-right (verified; old PTR page, kept for pre-April-2026 concerns)
- https://www.legislation.gov.uk/wsi/2011/704/regulation/15 (verified), /regulation/22 (verified), /regulation/24 (verified)
- https://www.legislation.gov.uk/wsi/2025/1099/contents (verified)
- https://cavuhb.nhs.wales/patient-advice/complaints/listening-to-people/ (verified)
- https://cavuhb.nhs.wales/patient-advice/concerns-complaints-and-compliments/concerns-complaints/ (verified; older page, says 2 working days)
- https://cavuhb.nhs.wales/files/concerns-complaints-and-compliments/concerns-form-manylion-am-y-pryder-doc/ (verified; .doc download)
- https://bipcaf.gig.cymru/patient-advice/cwynion/gwrando-ar-bobl/ (verified; Welsh)
- https://pthb.nhs.wales/contact-us/feedback-and-complaints/raise-a-complaint-or-concern-online-form/ (verified; form definition read from the site's Mura API, nothing submitted)
- https://bcuhb.nhs.wales/patients-and-visitors/peoples-enquiry-and-resolution-service-pears/ (verified); https://bipbc.gig.cymru/cleifion-ac-ymwelwyr/pears/ (verified; Welsh)
- https://www.smartsurvey.co.uk/s/bcuhbconcernsform (verified loads; legacy, see table)
- https://sbuhb.nhs.wales/about-us/complaints-compliments-and-feedback/listening-to-people/ (verified); https://bipba.gig.cymru/amdanom-ni/cwynion-canmoliaeth-ac-adborth/gwrando-ar-bobl/ (verified; Welsh)
- https://abuhb.nhs.wales/files/concerns-complaints/ptr-concerns-form-2024-english-docx/ (verified; .docx)
- https://bcuhb.nhs.wales/contact-us/contact-us/make-a-complaint/ (**broken**, 404; still linked from GP practice sites)
- https://sbuhb.nhs.wales/about-us/feedback/complaints (redirects to a 404 page; old URL)

## 3. Escalation: Public Services Ombudsman for Wales (PSOW)

- **Complain to the board first.** PSOW: "It is very unlikely that we will be able to help you unless you complete these two steps." People's guidance: PSOW expects "you have given the organisation the opportunity to investigate first".
- **Time limits:** PSOW health factsheet: within one year of the events or of becoming aware of them; "If you first complained to the Health Board or Trust within that year, you should complain to the Ombudsman within 12 weeks of their response." The gov.wales leaflet also says "you should do this within 12 weeks of receiving the response." PSOW guidance: "the events ... happened less than a year ago, or you became aware of them less than a year ago (unless you have a good reason ...)". Complaint-handling complaints are unlikely to be taken until the board "has had up to 6 months to respond".
- **What PSOW does:** can use clinical advisers to judge whether care was appropriate but cannot "question what we consider to be a reasonable clinical judgement"; it **recommends** remedies, it does not award damages. A concern under PSOW investigation is excluded from Listening to People "except where the PSOW recommends ... that a responsible body considers the concern for redress" (People's guidance p.9). Most complaints get an answer "within 6-9 weeks".
- **Online form:** https://complaints.ombudsman.wales/en/pre-complaint (verified). **No login.** Step 1 is a "Complaint Checker" with one radio choice ("Service Provider" or "Councillor/Panel Members") and a "Next" button (Laravel app with CSRF token; no CAPTCHA script on step 1). It is multi-step; later steps were **not seen** because reaching them means posting step 1 (not done). Uploads: the PSOW "thank you for your complaint" page says "If you have documents but were unable to attach them, then please email them to us at documents@ombudsman.wales", so the online form takes attachments (inferred, not seen). PSOW's other web forms (review request, service complaint) allow 5 files of max 16 MB each.
- **Paper form** (2026, PDF, 10 pages): A your details and language choice (English/Welsh) and contact method (Email/Post/Phone); B on behalf of someone else plus their signature; C body complained about, whether and when you complained, date you first became aware ("If it has been more than 12 months please explain why"), what went wrong, what should be done, "Have you considered Legal Action? If not, why not?", how you were affected, why unhappy with the response; D adjustments; E declaration and signature. Post to 1 Ffordd yr Hen Gae, Pencoed CF35 5LJ. Phone 0300 790 0203, ask@ombudsman.wales.
- Welsh: "All our documents are available in both Welsh and English"; site toggle "Cymraeg"; Welsh site ombwdsmon.cymru.

URLs:
- https://www.ombudsman.wales/complaints/ (verified)
- https://complaints.ombudsman.wales/en/pre-complaint (verified; step 1 only)
- https://www.ombwdsmon.cymru/sut-i-gwyno/ (verified; Welsh)
- https://www.ombudsman.wales/fact-sheets/health-nhs-complaints-general-information/ (verified; already refers to "LTP")
- https://www.ombudsman.wales/fact-sheets/thank-you-for-your-complaint/ (verified)
- https://www.ombudsman.wales/wp-content/uploads/2026/03/Complaint-form-MAL-ENG-2.0-1.pdf (verified)
- https://www.ombudsman.wales/wp-content/uploads/2025/11/Guidance-on-how-to-submit-to-us-complaints-about-service-providers-v2.pdf (verified)
- http://www.ombudsman-wales.org.uk (old domain still printed on the gov.wales leaflet; not verified)

## 4. Compensation route

### 4a. NHS Redress in Wales (inside the concerns process, Part 6 of the 2011 Regs)
- **Trigger:** only through a Stage 2 investigation by a Welsh NHS body. "Qualifying liability" (reg 2) = "a liability in tort owed in respect of, or consequent upon, personal injury or loss arising out of or in connection with breach of a duty of care ... in connection with the diagnosis of illness, or in the care or treatment of any patient ... in consequence of any act or omission by a health care professional". People's guidance: the organisation must "assess if the standard of care provided was below the accepted standard of care and if this is the case, whether that then directly caused the harm".
- **Cap (reg 29, as amended 1.4.2026):** "A Welsh NHS body may make an offer of redress for a qualifying liability by way of financial compensation in which the sum does not exceed £50,000." "Where a Welsh NHS body considers that the value to be attributed to the qualifying liability exceeds £50,000, redress in the form of financial compensation must not be offered in accordance with this Part." Above the cap the board "may give consideration to making an offer of settlement outside the provisions of these Regulations" (reg 29(3)). Damages for pain, suffering and loss of amenity are "calculated on the common law basis" (reg 29(4)). WHC/2026/006: "Increased financial redress threshold from £25,000 to £50,000."
- Redress can also be "further or alternative treatment or care ... or another appropriate measure".
- **Interim report** where there is or may be a qualifying liability (reg 26): within 30 working days, at the latest 120 working days; must explain "the availability of access to legal advice without charge".
- **Free legal advice (reg 32):** the board "must ensure ... that legal advice is available"; "Legal advice must only be sought from firms of solicitors who have a recognised expertise in the field of clinical negligence. Firms will be recognised as having the necessary expertise if they have at least one partner or employee who is a member of the Law Society Clinical Negligence Panel or the Action Against Medical Accidents Clinical Negligence Panel." Free advice covers joint instruction of medical experts, any offer, any refusal, and any settlement agreement; "The cost of such legal advice and costs arising from the instruction of such medical experts must be borne in their entirety by the Welsh NHS body." Experts are **jointly instructed** with the patient.
- **Decision (reg 33):** offer or "no qualifying liability" decision "within 120 working days" of the concern; the patient must respond "within six months"; settlement "must include a waiver of any right to bring civil proceedings". Court approval needed for children / people lacking capacity, at the board's cost.
- **Limitation suspended (reg 30):** "any limitation period for the bringing of civil proceedings ... is suspended" from receipt of the concern until acceptance/rejection, but ends "nine calendar months from the date upon which the Welsh NHS body makes an offer" (or communicates a no-liability decision).
- If court proceedings are issued the investigation "must be paused until civil proceedings have concluded" (People's guidance p.8).
- Not found: any fixed fee for the free legal advice in current official text (secondary sources mention a historic £1,600 + VAT figure; not confirmed, do not use).

### 4b. Outside redress: clinical negligence claim in the courts of England and Wales
- Wales shares the England and Wales court system and Civil Procedure Rules.
- **Pre-Action Protocol for the Resolution of Clinical Disputes:** request records, Letter of Notification, Letter of Claim; "The Protocol provides for a defendant to be given four months to investigate and respond to a Letter of Claim before proceedings are served." It "does not alter the statutory time limits".
- **Limitation:** Limitation Act 1980 s.11(4): "three years from— (a) the date on which the cause of action accrued; or (b) the date of knowledge (if later) of the person injured." (date of knowledge defined in s.14). Suspended during redress (reg 30 above).
- Claims against Welsh health boards are handled with NHS Wales Shared Services Partnership Legal and Risk Services (named in the organisational guidance); not researched further.

URLs:
- https://www.legislation.gov.uk/wsi/2011/704/regulation/2 (verified), /regulation/26, /29, /30, /32, /33 (all verified; revised text current to 1.4.2026)
- https://www.justice.gov.uk/courts/procedure-rules/civil/protocol/prot_rcd (verified)
- https://www.legislation.gov.uk/ukpga/1980/58/section/11 (verified); /section/14 (verified)

## 5. Funding

- **Redress:** free legal advice and joint expert costs paid by the health board (reg 32). This is the main funding route for claims up to £50,000.
- **Legal aid:** adult clinical negligence is **out of scope**. LASPO 2012 Sch.1 Pt.1 para 23 covers only clinical negligence "which caused a neurological injury to an individual ... as a result of which V is severely disabled" occurring in the womb or within 8 weeks of birth. Exceptional case funding exists (gov.uk/legal-aid) but is unlikely here.
- **Online checker:** "Check if you can get legal aid" (no login; categories include "Legal action against police and public organisations ... NHS"). MoJ "Find a legal aid adviser" has a postcode search with a "Clinical negligence" category (and a Cymraeg link).
- **No win no fee:** Conditional Fee Agreements Order 2013 art.5: in personal injury proceedings at first instance the success fee is capped at "25%" of "general damages for pain, suffering, and loss of amenity; and ... damages for pecuniary loss, other than future pecuniary loss".

URLs:
- https://www.legislation.gov.uk/ukpga/2012/10/schedule/1/part/1 (verified; para 23)
- https://www.gov.uk/legal-aid (verified); https://www.gov.uk/legal-aid/check-legal-aid (verified)
- https://checklegalaid.service.gov.uk/start?locale=en_GB (verified; no login)
- https://find-legal-advice.justice.gov.uk/ (verified; no login)
- https://www.legislation.gov.uk/uksi/2013/689/article/5 (verified)

## 6. Finding a lawyer

- **Law Society Find a Solicitor** (England and Wales): quick search (legal issue + location) and advanced search with "Area of practice" including "Clinical negligence". Law Society help: "Click the 'More options' button to search by: Law Society accreditation (quality mark) ... Firms and individuals who speak a specific language." A Welsh-language filter was **not confirmed** (likely via the general language option). **Bot wall:** the home page loads, but search result URLs returned HTTP 503 "Please wait while we verify your browser. JavaScript must be enabled" (captcha challenge) to curl. A real browser may pass; an agent should expect a challenge.
- **AvMA Find a Solicitor:** filters "Regions" (includes "Wales" and "All of England and Wales") and "Specialisms"; no login needed to search (page says so implicitly; sign-in link exists). AvMA helpline 0345 123 2352.
- **Why it matters in Wales:** for free redress advice the firm must have a member of the **Law Society Clinical Negligence Panel or AvMA Clinical Negligence Panel** (reg 32(2)). So the agent should filter by accreditation, not just "clinical negligence".
- AvMA's own Wales complaint page is **out of date** (says "Putting Things Right" and "£25,000"); do not use it for figures.

URLs:
- https://solicitors.lawsociety.org.uk/ (verified home page; result pages 503 bot check)
- https://www.lawsociety.org.uk/public/for-public-visitors/using-a-solicitor/help-using-fas (verified)
- https://www.avma.org.uk/help-advice/find-a-solicitor (verified; 301 to https://my.avma.org.uk/find-a-solicitor/, verified)
- https://www.avma.org.uk/resource/making-a-complaint-to-the-nhs-in-wales/ (verified; outdated content)

## 7. Clinical guidelines body

- **NICE guidance applies in Wales.** gov.wales: "We have an agreement that all NICE guidelines and quality standards are available to use in Wales. Except for technology appraisal guidance (TAGs), their use is not mandatory. All NICE guidance used in Wales is subject to Welsh legislation." NICE products are not translated into Welsh (Welsh Language Standards do not apply to NICE).
- **Scaphoid:** NICE NG38 "Fractures (non-complex): assessment and management" (published 17 February 2016), rec **1.2.3**: "Consider MRI for first-line imaging in people with suspected scaphoid fractures following a thorough clinical examination." NG38 also says professionals "are expected to take this guideline fully into account" but "It is not mandatory to apply the recommendations".
- No separate Welsh national scaphoid guideline found (not searched exhaustively; health boards may have local pathways).
- NICE returned HTTP 403 to WebFetch but 200 to curl with a browser user agent.

URLs:
- https://gov.wales/national-institute-health-and-care-excellence-nice-guidelines (verified; last updated 11 September 2024)
- https://www.nice.org.uk/guidance/ng38 (verified)
- https://www.nice.org.uk/guidance/ng38/chapter/Recommendations (verified)

## 8. Free advice and advocacy

- **Llais** (the Citizen Voice Body, replaced the Community Health Councils in April 2023): free, independent, confidential complaints advocacy for NHS concerns; helps with letters and meetings; can join the listening discussion. Phone 029 2023 5558, enquiries@llaiswales.org (leaflet) / enquiries@llaiscymru.org (gov.wales page), Llais, Crown Buildings, Cathays Park, Cardiff CF10 3NQ. Regional teams incl. Cardiff & Vale. No individual online referral form seen; a professional referral form PDF exists. Welsh site llaiscymru.org. Llais does not give legal advice.
- **Citizens Advice Wales:** points to the Welsh Government page for NHS complaints and to Healthcare Inspectorate Wales (HIW), which "can't help you get compensation".
- **AvMA** helpline (see section 6).
- **HIW** (inspectorate; patients can tell it about concerns; it does not resolve individual complaints).

URLs:
- https://www.llaiswales.org/ (verified); https://www.llaiswales.org/have-your-say/making-complaint (verified); https://www.llaiswales.org/in-your-area/cardiff-vale (verified); https://www.llaiswales.org/news-and-reports/reports/listening-people (verified); https://www.llaiscymru.org/ (verified)
- https://www.citizensadvice.org.uk/wales/health/ (verified); https://www.citizensadvice.org.uk/wales/health/nhs-healthcare/nhs-complaints-w/ (redirects to /wales/health/get-advice-about-health-services/, verified)
- https://www.hiw.org.uk/ (verified)

## 9. Medical records access

- Subject access request under UK GDPR to the health board's health records department. No online SAR form found for Cardiff and Vale: "To gain access to your health records you will need to contact our Health Records Department." Write to Health Records Manager, Health Records Department, Cardiff and Vale UHB, University Hospital of Wales, Heath Park, Cardiff CF14 4XW; CAV.AccessToRecords@Wales.NHS.UK; 029 2074 6500. "We will respond within one month but in some cases we may have to extend the time". "You are entitled to either look at your records or to receive a copy." Fee and ID requirements not stated on the page.
- Other boards publish Word SAR forms (e.g. Cwm Taf Morgannwg, Betsi Cadwaladr; not verified).
- In Listening to People the board itself must include "a copy of any relevant medical records, where this is appropriate" in its response (reg 24(1)(d)) and in the interim report (reg 26(1)(d)), so the patient may get records without a separate SAR.
- The NHS Wales App shows GP-held data behind NHS login (not hospital A&E notes); not researched further.

URLs:
- https://cavuhb.nhs.wales/our-services/health-records (verified)
- https://cavuhb.nhs.wales/use-of-site/privacy-policy/access-to-your-health-records/ (verified)
- https://ico.org.uk/for-the-public/getting-copies-of-your-information-subject-access-request/ (verified)

## 10. Browser-agent notes

| Step | Without login? | Online or phone/post? | Bot wall / CAPTCHA | Language |
|---|---|---|---|---|
| Find health board | Yes | nhs.wales tiles (JS); 111 Wales local services search (ASP.NET postback) | none seen | EN/CY |
| Concern to Cardiff and Vale | Yes | **No web form**: email Cav.Concerns@wales.nhs.uk, phone, post, or bilingual Word form | n/a | EN/CY (+BSL SignVideo) |
| Concern to Powys | Yes | One-page web form | hidden honeypot + mouse/keypress checks, no CAPTCHA | EN/CY |
| Concern to Betsi Cadwaladr | Yes | Phone/email; legacy SmartSurvey multi-page form | none seen on page 1 | EN (Welsh form not seen) |
| Concern to Swansea Bay | Not determined | contact tiles load by JS | unknown | EN/CY |
| PSOW complaint | Yes | Multi-step web form (step 1 seen), PDF, phone | none on step 1 | EN/CY toggle |
| Legal aid checker / Find a legal aid adviser | Yes | Web (GOV.UK) | none | EN/CY |
| Law Society Find a Solicitor | Yes | Web | **JS browser verification / captcha on results** | EN |
| AvMA Find a Solicitor | Yes | Web (region + specialism) | none mentioned | EN |
| Llais advocacy | Yes | Phone/email (no form for individuals) | n/a | EN/CY |
| Medical records (Cardiff) | Yes | Letter/email only | n/a | EN/CY |

Most pages on the `*.nhs.wales` sites (built by Digital Health and Care Wales on Mura CMS) render key content client-side, so the agent must use a real browser and wait for JavaScript; static fetches miss contact details. Every health board has a parallel Welsh site (`bip*.gig.cymru`), and the regulations require the board to respect Welsh as the patient's language.

**Hardest, most impressive browser task in Wales:** take the patient from "UHW Cardiff" to a complete, rule-aware Listening to People package: (1) identify Cardiff and Vale UHB, (2) draft the concern and fill the bilingual concern form fields (or the Powys-style web form where one exists) in the patient's chosen language, stopping before send, (3) then find solicitors who satisfy reg 32 (Law Society **or** AvMA Clinical Negligence Panel, in Wales) by searching both directories and cross-checking, despite the Law Society browser check. Second best: walk the PSOW multi-step form (in Welsh if chosen) up to the final review page and stop.

Three best browser tasks:
1. **PSOW online complaint** (multi-step, no login, EN/CY toggle, attachments) filled and stopped before submit.
2. **Panel-solicitor search for free redress advice**: Law Society Find a Solicitor (Cardiff, Clinical negligence, accreditation filter, language) + AvMA (region Wales), then intersect.
3. **Health board concern form**: Powys one-page web form shows the pattern; for Cardiff the agent prepares the email to Cav.Concerns@wales.nhs.uk with the Word form content (there is no web form).

Watch-outs: quote **£50,000** and **Listening to People** for concerns from 1 April 2026; acknowledgement is 5 working days (not 2); PSOW within 12 weeks of the board's response; a redress settlement waives the right to sue; limitation restarts 9 months after an offer or no-liability decision.

## 11. Fictional test persona (UK nations only)

All details are invented. Do not use for real submissions.

- **Name:** Elin Rhydderch, 21, second-year undergraduate in Cardiff, works part-time shifts in a café.
- **Address:** 23 Clos Dychmygol, Cathays, Cardiff CF24 4QW (invented street; CF24 is the Cathays/Roath postcode district; not checked against Royal Mail).
- **Email:** elin.rhydderch@example.com
- **Phone:** 07700 900582
- **Language preference:** English for correspondence, happy to speak Welsh at the listening discussion.
- **Story:** On Saturday 12 September 2026 Elin slipped on wet steps and fell on her outstretched right (dominant) hand. That evening she went to the Emergency Unit at **University Hospital of Wales, Heath Park, Cardiff** (Cardiff and Vale UHB). A wrist X-ray was read as showing no fracture; she was told it was a sprain, given a support bandage and advice, and discharged with no follow-up or repeat imaging and no scaphoid-specific advice. Pain at the base of the thumb continued. On 19 October 2026 her GP sent her for a repeat X-ray and MRI, which on 26 October 2026 showed a displaced fracture of the scaphoid waist that had not healed. The fracture clinic now plans surgery (screw fixation, possibly bone graft). She missed her autumn-term class tests (she cannot write with her right hand) and several weeks of café shifts, and will miss more after surgery.
- **What she wants:** an explanation of why scaphoid fracture was not considered or followed up (NICE NG38 rec 1.2.3), an apology, changes to the A&E pathway, and compensation for pain, lost earnings and the delayed degree.
- **Key dates for the agent:** concern deadline 12 months, so by **12 September 2027** (or from when she became aware, 26 October 2026, so 26 October 2027 at the latest); absolute bar 3 years; PSOW within 12 weeks of the board's final response; court limitation 3 years from date of knowledge (suspended while redress is considered).
- **Route:** Cardiff and Vale UHB concerns team (Cav.Concerns@wales.nhs.uk / Word form / 029 218 36318) -> Stage 2 investigation with qualifying-liability assessment -> redress up to £50,000 with free advice from a Law Society or AvMA panel solicitor -> PSOW if unhappy.

## Sources

Official (all verified 200 on 2026-11-07 unless marked):
- Welsh Government, Listening to People: https://www.gov.wales/listening-people-nhs-wales-complaints-incidents-and-redress-process
- People's guidance (PDF): https://www.gov.wales/sites/default/files/publications/2026-03/listening-to-people-the-nhs-wales-complaints-incidents-and-redress-process-peoples-guidance_0.pdf
- Leaflet (PDF): https://www.gov.wales/sites/default/files/publications/2026-06/listening-to-people-leaflet_0.pdf
- WHC/2026/006 (PDF): https://www.gov.wales/sites/default/files/publications/2026-03/whc-2026-006-listening-to-people.pdf
- Organisational guidance: https://www.gov.wales/sites/default/files/publications/2026-03/listening-to-people-the-nhs-wales-complaints-incidents-and-redress-process-organisation-guidance.pdf (verified)
- Putting Things Right (legacy): https://www.gov.wales/nhs-wales-complaints-and-concerns-putting-things-right
- S.I. 2011/704 (revised): https://www.legislation.gov.uk/wsi/2011/704/contents
- S.I. 2025/1099: https://www.legislation.gov.uk/wsi/2025/1099/contents
- NHS Wales local services: https://www.nhs.wales/hpb/local-services/
- NHS 111 Wales services near you: https://111.wales.nhs.uk/localservices/?locale=en
- Health board pages: see section 1 and 2
- PSOW: https://www.ombudsman.wales/complaints/ and https://complaints.ombudsman.wales/en/pre-complaint
- Llais: https://www.llaiswales.org/have-your-say/making-complaint
- Law Society Find a Solicitor: https://solicitors.lawsociety.org.uk/
- AvMA Find a Solicitor: https://my.avma.org.uk/find-a-solicitor/
- Legal aid: https://www.gov.uk/legal-aid/check-legal-aid, https://find-legal-advice.justice.gov.uk/
- LASPO Sch.1 Pt.1: https://www.legislation.gov.uk/ukpga/2012/10/schedule/1/part/1
- CFA Order 2013 art.5: https://www.legislation.gov.uk/uksi/2013/689/article/5
- Limitation Act 1980 s.11: https://www.legislation.gov.uk/ukpga/1980/58/section/11
- Pre-Action Protocol (clinical disputes): https://www.justice.gov.uk/courts/procedure-rules/civil/protocol/prot_rcd
- NICE in Wales: https://gov.wales/national-institute-health-and-care-excellence-nice-guidelines
- NICE NG38: https://www.nice.org.uk/guidance/ng38/chapter/Recommendations
- Cardiff and Vale health records: https://cavuhb.nhs.wales/use-of-site/privacy-policy/access-to-your-health-records/
- Citizens Advice Wales: https://www.citizensadvice.org.uk/wales/health/
