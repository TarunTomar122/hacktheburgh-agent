# India (researched 2026-11-07)

Scope: a patient harmed by care at a **public** hospital (here: the emergency department of a large government hospital missed a scaphoid (wrist) fracture, and the patient now needs surgery) who wants (a) answers and an apology and (b) possibly compensation.
Every fact has a source link. URL status: **verified** = fetched or `curl` returned 200 on 2026-11-07; **not verified** = not loaded, or loaded but content not checked; **broken** = 404 or connection failure from our network.

**Network caveat:** several Indian government hosts timed out (`000`) from our network: `edaakhil.nic.in`, `confonet.nic.in`, `consumeraffairs.nic.in`, `cpgrams.gov.in`, `www.ukmedicalcouncil.org`, `wbmc.wb.gov.in`. Some `.nic.in` and `.gov.in` sites block or drop non-Indian IP addresses. An agent hosted outside India may see the same failures. Treat these as "unreachable from here", not proven dead.

**Key point for this case:** whether the patient paid decides the route. Under *Indian Medical Association v V.P. Shantha* (1995), service at a government hospital where **no one** is charged falls outside consumer law. If the hospital charges some patients, or an insurer or employer paid (for example ESI or CGHS), the case is covered. The agent must ask: "Did you pay anything beyond a registration token, or was it paid by insurance or an employer?"

## 1. Which body runs the hospital, and how a patient finds out
- Health is a **state subject**. Most public hospitals (district hospitals, medical-college hospitals) are run by the **State/UT Health Department** (Directorate of Health Services or Medical Education). A few are **central**: AIIMS institutions, Safdarjung, RML and Lady Hardinge (New Delhi), PGIMER Chandigarh, JIPMER, ESIC hospitals and railway hospitals. Each is headed by a **Medical Superintendent**.
- How to tell: the hospital name or letterhead usually says "Government of <State>" or "Ministry of Health & Family Welfare, Government of India". This matters for which portal to use: CPGRAMS and RTI Online cover **central** bodies only (see §2 and §9).
- Official national charter: the MoHFW **Charter of Patients' Rights**, approved by the National Council for Clinical Establishments and "As updated on 23rd August 2021". It applies to "the clinical establishment", but states adopt it at different paces. https://clinicalestablishments.mohfw.gov.in/sites/default/files/2023-06/3181.pdf (**verified**)

## 2. Complaint to the provider
- **Hospital grievance officer.** Right xix of the Charter: *"Every Hospital shall have/establish a time bound Grievance redressal mechanism… A Grievance redressal officer will be identified by the hospital and his name and contact details will be displayed at a conspicuous place in local language and in English… The name and contact details of the district registering authority will also be displayed who may be contacted in case of non-redressal."* (3181.pdf, **verified**)
  - **No national online form.** Complaints go on paper or by email to the Medical Superintendent or grievance officer. No national response deadline was found. "Time bound" is left to each hospital or state.
- **Government grievance portals** (an escalation inside government, still not a legal claim):
  - **CPGRAMS** (central ministries, including MoHFW for central hospitals; it also routes to states): https://pgportal.gov.in (**verified**). Registration page: https://pgportal.gov.in/Registration (**verified**). Fields: Name, Gender, Address, Country, State, District, Pincode, Mobile, Email, plus an **image "Security Code" CAPTCHA**. Sign-in uses an OTP (`/Signin/GenerateOtp`). The interface is available in **22+ Indian languages**.
  - Many states run their own CM or public-grievance portals (for example UP IGRS "Jansunwai"). These were not researched one by one.
- **National Consumer Helpline (NCH) / INGRAM** (pre-litigation mediation, 17 languages): https://consumerhelpline.gov.in/public/ (**verified**).
  - Channels: toll-free **1915** (8am–8pm), WhatsApp or SMS **+91 8800001915**, the NCH app, UMANG, or the web portal.
  - Web login (https://consumerhelpline.gov.in/user/, **verified**) is "Login With OTP" on a mobile number. The number must match the pattern `[6-9][0-9]{9}`, so **only Indian mobile numbers work**, and there is an **image CAPTCHA**.
  - Sign-up (https://consumerhelpline.gov.in/user/signup.php, **verified**) asks for name, mobile, email, password and CAPTCHA.
  - NCH is designed around companies. Its value for a *government* hospital is doubtful (not verified).

## 3. Escalation: regulator
- **State Medical Council (SMC)** handles professional misconduct by the individual doctor. It does not award compensation.
  - The conduct rules currently in force are the **IMC (Professional Conduct, Etiquette and Ethics) Regulations 2002**. The NMC put its own 2023 regulations "in abeyance" by gazette notification of 23 Aug 2023 and directed the 2002 code to apply (news reports, e.g. https://medicaldialogues.in/health-news/nmc/breaking-news-nmc-puts-its-controversial-registered-medical-practitioner-professional-conduct-regulations-2023-put-on-hold-116314, **not verified**).
  - The 2002 text on the NMC site: https://nmc.org.in/page/rules-regulations-rules-regulations-of-erstwhile-mci-code-of-medical-ethics-regulations-2002 (**verified**).
  - Complaint procedure under the 2002 regulations (summarised by Nyaya, https://nyaaya.org/legal-explainer/complaining-against-a-medical-professional/, **verified**):
    - Reg 8.2: you "file any complaint with regard to professional misconduct to the State Medical Council".
    - Reg 8.7: if the SMC "has not decided upon a complaint for over six months", the complainant can go to the national body.
    - Reg 8.8: a decision can be challenged "within 60 days from receiving the order".
  - **Form of complaint:** written and signed, usually with supporting treatment records, often on affidavit. Delhi Medical Council orders reject complaints that are unsigned or not "in terms of Rule 32 of the Delhi Medical Council Rules, 2003" (orders listed in search results, **not verified**).
  - **Online filing is patchy.** A Vidhi Centre study reports only four SMCs with an online complaint portal. Maharashtra Medical Council launched one in 2019 (Hitavada report). Uttarakhand has `online.ukmedicalcouncil.org/complaint`, but **DNS failed** from here (**broken**).
  - The DMC (https://delhimedicalcouncil.org, **verified**) and MMC (https://www.maharashtramedicalcouncil.in/, **verified**) homepages are JavaScript single-page apps. No complaint route could be found without rendering them (**not verified**).
- **National Medical Commission / Ethics and Medical Registration Board (EMRB):** https://www.nmc.org.in (**verified**).
  - Under NMC Act 2019 s.30, the EMRB hears appeals against SMC decisions (s.30(3)), with a second appeal to the NMC (s.30(4), 60 days).
  - **Patients are effectively shut out.** Courts and the NMC have read s.30 as giving appeal rights to *practitioners*. One Bombay HC order notes "no provision for a complainant preferring a further appeal". Amendments to let patients appeal were proposed but **not confirmed enacted** (Down To Earth, Medical Dialogues; **not verified**).
  - Online Ethics Appeal Portal: https://application.nmc.org.in/appeal (**verified**, loads). Per NMC's public notice of 23 Jul 2026 it is for *RMPs* (doctors), and offline or email appeals have been discontinued (Medical Dialogues, https://medicaldialogues.in/health-news/nmc/nmc-launches-online-ethics-appeal-portal-for-doctors-175653, **verified**).
- No health ombudsman exists. **State Human Rights Commission / NHRC** complaints are possible for public hospitals (not researched).

## 4. Compensation route
**A. Consumer Commission (main route for compensation, no court fee for small claims)**
- **Law:** Consumer Protection Act 2019 (CPA). Medical services count as "service" per *V.P. Shantha*, conclusions as excerpted on courtkutchehry (https://www.courtkutchehry.com/judgements/678455/indian-medical-association-vs-vp-shantha-and-others, **verified**):
  - (9) Government hospital "where no charge whatsoever is made from any person": outside the Act. Token registration does not change this.
  - (10) Government hospital "where services are rendered on payment of charges" to some patients: within the Act, *including* the free patients.
  - (11) Insurer pays, or (12) employer pays as a condition of service: within the Act.
- **Which commission (pecuniary limits)** are set by the CP (Jurisdiction…) Rules 2021, notified 30 Dec 2021. They are measured by the **value of consideration paid**, not the compensation claimed:
  - District Commission: up to ₹50 lakh
  - State Commission: above ₹50 lakh up to ₹2 crore
  - National Commission (NCDRC): above ₹2 crore
  - Source: SCC Online, https://www.scconline.com/blog/post/2022/01/03/pecuniary-jurisdiction-of-district-state-and-national-commissions-revised-vide-consumer-protection-jurisdiction-of-the-district-commission-the-state-commission-and-the-national-commission-rules-2/ (**verified**).
  - A missed fracture at a government hospital will almost always go to the **District Commission**.
- **Fees** under CP (CDRC) Rules 2020, rule 7, table substituted by the 2023 amendment G.S.R. 606(E) (https://egazette.gov.in/WriteReadData/2023/248158.pdf, **verified** loads):
  - **Nil** where consideration is up to ₹5 lakh.
  - ₹200 for over ₹5–10 lakh and ₹400 for over ₹10–20 lakh (secondary sources; **not verified** against the gazette text).
- **Limitation:** CPA s.69(1): the Commission "shall not admit a complaint unless it is filed within two years from the date on which the cause of action has arisen". s.69(2) allows a late complaint for "sufficient cause", provided the Commission "records its reasons for condoning such delay". (https://www.advocatekhoj.com/library/bareacts/consumerprotection2019/69.php, **verified**)
  - For medical negligence the Supreme Court has accepted that the cause of action can run from *discovery* of the negligence (*V.N. Shrikhande v Anita Sena Fernandes*, AIR 2011 SC 212). Reports differ on the outcome of that case (**not verified**).
  - For a missed scaphoid fracture, the safe date to count from is the date the fracture was found.
- **Admission:** s.36(2) says admissibility "shall ordinarily be decided within twenty-one days". s.36(3): if not decided, "it shall be deemed to have been admitted" (https://www.advocatekhoj.com/library/bareacts/consumerprotection2019/36.php, **verified**).
- **No pre-action notice is required** for consumer complaints. Lawyers often send a legal notice anyway.
- **Filing:** e-Jagriti (§10). A **notarised affidavit** in support of the complaint is required at District level (string in the e-Jagriti app: "Notarised Affidavit in support of pleadings filed before District Commission").

**B. Civil suit for negligence (tort)**
- Use this if consumer law does not apply (a wholly free government hospital).
- Against a state or central government body, **CPC s.80 requires two months' notice** before suing the Government.
- Limitation is likely 3 years (Limitation Act 1963 residuary Art. 113), but a 1-year article may be argued against public officers. **Not verified; needs a lawyer.**

**C. Writ petition (Art. 226) in the High Court** seeking public-law compensation from the State. Not researched.

**D. Criminal complaint** (police or magistrate) for rash or negligent act under the Bharatiya Nyaya Sanhita 2023. *Jacob Mathew* (2005) requires gross negligence and a medical opinion before prosecuting doctors. This is unsuitable for a missed fracture and not researched further.

**No national no-fault compensation scheme for medical injury was found.**

## 5. Funding
- **Legal aid** (free lawyer, advice and drafting) comes from the Legal Services Authorities (NALSA, State LSA, District LSA, Taluka LSC) under the Legal Services Authorities Act 1987 s.12.
  - Eligible categories (from the official form's dropdown, **verified**): SC/ST; women; children; persons with disability; industrial workmen; persons in custody; victims of mass disaster or trafficking; transgender persons; defence personnel; and "General (Persons whose annual income does not exceed prescribed limit)". The income limit is set by each state and varies.
  - **Online application with no login:** https://scourtapp.nic.in/lsams/nologin/applicationFiling.action?requestLocale=en (**verified**, linked from https://nalsa.gov.in, **verified**). Details in §10.
  - NALSA helpline **15100** (https://nalsa15100.in/, **verified**).
- **Tele-Law / Nyaya Bandhu** (Department of Justice): free pre-litigation advice via Common Services Centres and app. Merged as "Tele-Law 2.0" in Aug 2023. https://www.tele-law.in (**verified**). Pro bono portal https://probono-doj.in returned **403** (**broken** from here).
- **No win, no fee is prohibited.** BCI Rules Part VI Ch. II Rule 20: an advocate "shall not stipulate for a fee contingent on the results of litigation or agree to share the proceeds thereof" (secondary sources; BCI text **not verified**).
- Consumer complaints up to ₹5 lakh carry **no fee**, and parties may appear **in person** without a lawyer. This is the realistic no-cost route.

## 6. Finding a lawyer
- **No official national directory searchable by specialism.** India has no certified-specialist scheme.
- BCI Rule 36 bans advocates from advertising or soliciting work. A 2008 proviso allows only basic website particulars (name, contact, enrolment number, bar council). The BCI reaffirmed this in 2025–26.
- **Bar Council of India:** https://www.barcouncilofindia.org (**verified** loads). Advocates enrol with their **State Bar Council**. Enrolment numbers look like `StateCode/Number/Year`. Some state bar councils offer a roll search to check enrolment (varies; **not verified**).
- **Practical routes:**
  - the DLSA panel lawyer, through the legal-aid form (§5);
  - the District Consumer Commission's bar room;
  - e-Jagriti, which has an "Advocate Search" for adding a counsel already registered on the platform (inside login).

## 7. Clinical guidelines body
- MoHFW **Standard Treatment Guidelines**, published via the Clinical Establishments portal: https://clinicalestablishments.mohfw.gov.in/standard-treatment-guidelines (**verified**).
- **Orthopaedics STG**, "STANDARD TREATMENT GUIDELINES FOR ORTHOPAEDICS, Ministry of Health & Family Welfare Govt. of India": https://clinicalestablishments.mohfw.gov.in/sites/default/files/standard-treatment-guidelines/8611.pdf (**verified**, text extracted). Section 9 "HAND INJURIES", p.36, "Scaphoid Fracture" says:
  - *"Fracture of the carpal scaphoid bone is the most common fracture of the carpus, and frequently diagnosis is delayed."*
  - *"Diagnosis & Investigations: Clinical evaluation + X-rays (PA, Lateral, scaphoid view, clenched fist view) MRI, CT, bone scan may be used to diagnose occult scaphoid fractures"*
  - *"Complications: Delayed union, malunion, nonunion, osteonecrosis, CRPS"*
  - *"Tuberosity fractures and Nondisplaced distal third fractures: Conservative with scaphoid cast for 6-8 weeks"*
- The STG says nothing about snuffbox tenderness or repeat X-ray at 10–14 days. NICE or RCEM guidance would be persuasive but not binding.
- No India body plays a NICE-like role in emergency care. ICMR and NHSRC publish some guidelines (not researched).

## 8. Free advice and advocacy
- **Legal aid:** NALSA 15100, District Legal Services Authority front offices (§5).
- **Consumer:** NCH 1915 (§2). Each state has Voluntary Consumer Organisations (not researched).
- **Charter of Patients' Rights:** right xix, the "district registering authority" contact displayed at the hospital (§2).
- Patient-safety NGOs exist (for example People for Better Treatment, Jan Swasthya Abhiyan). They are not official and were not researched.

## 9. Medical records access
- **IMC Regulations 2002, reg 1.3.2** (NMC page **verified**; wording confirmed in several reproductions, including the Delhi and Telangana councils' texts): *"If any request is made for medical records either by the patients / authorised attendant or legal authorities involved, the same may be duly acknowledged and documents shall be issued within the period of 72 hours."*
  - Reg 7.2 makes refusing to provide records within that period professional misconduct.
  - Reg 1.3.1 requires indoor records to be kept for **3 years**.
  - Courts have read reg 1.3.2 as requiring the *entire case sheet*.
  - For an emergency-department (outpatient) visit, the doctor's records are thinner. Ask for the ED card or OPD slip, the X-ray films or images, and the radiology report.
- **Charter right iii:** to "access a copy of the case papers, patient records, investigation reports and detailed bill (itemized)" (3181.pdf, **verified**).
- **RTI** (government hospitals only): RTI Act 2005, with a reply due in 30 days.
  - Central hospitals: **RTI Online** https://rtionline.gov.in (**verified**): "User Registration is not mandatory". Since 16 Jun 2025, "email verification via OTP will be implemented for all RTI requests". Fee is ₹10 online (netbanking, card or UPI). It is "for all Ministries/Departments and other Public Authorities of Central Government", and the site warns *"Please do not file RTI applications through this portal for the public authorities under the State Governments"*.
  - State hospitals: use the state's RTI portal if one exists, or post a paper application with a ₹10 fee (state rules vary).
  - Only "Indian Citizens" may file.

## 10. Browser-agent notes

| Step | Website | Login? | CAPTCHA / bot wall | Language | Agent can do it? |
|---|---|---|---|---|---|
| Hospital grievance | none national; email or letter to Medical Superintendent | — | — | English or state language | **Draft only** (letter or email) |
| CPGRAMS grievance (central hospital) | pgportal.gov.in | **Yes**: register, then mobile OTP | **Image CAPTCHA** ("Security Code") on registration | 22+ languages incl. English | Fill the registration form up to the CAPTCHA, then hand over. OTP and CAPTCHA need the human |
| NCH pre-litigation | consumerhelpline.gov.in | **Yes**: mobile OTP, **Indian mobile only** (`[6-9]\d{9}`) | **Image CAPTCHA** (audio option) | 17 languages | Hand over at login. Alternative: draft a WhatsApp message to +91 8800001915 |
| **Legal-aid application (NALSA LSMS)** | scourtapp.nic.in/lsams/nologin/applicationFiling.action | **No login** ("nologin" in the URL) | **No CAPTCHA** in the HTML (0 hits). Struts CSRF token only | English (`requestLocale=en`); Hindi likely via `requestLocale` (not verified) | **Yes: full form fill, stop before `btnSubmit`** |
| RTI for records (central hospital) | rtionline.gov.in/request/request.php | Not mandatory, but **email OTP** since Jun 2025; ₹10 payment | Not checked behind the "Submit Request" step | English, Hindi | Fill until OTP and payment, then hand over |
| SMC complaint | each state's council site; most are offline | Varies (MMC portal issues login credentials after filing, per 2019 report) | Unknown | English or state language | **Draft** a signed complaint or affidavit. Online only in ~4 states. Sites are JS apps, some unreachable from abroad |
| EMRB appeal | application.nmc.org.in/appeal | Yes (doctors' portal) | — | English | **Not applicable to patients** |
| **Consumer complaint** | **e-jagriti.gov.in** (e-Daakhil retired; merged into e-Jagriti 1 Jan 2025) | **Yes**: "ADVOCATE/CONSUMER/COMPANY LOGIN", "SIGN UP", "OTP-based onboarding" (PIB) | **Image CAPTCHA** with audio and refresh on login and on case-status search | "Multilingual support" (PIB). App strings seen are English | **Hand over at sign-up or login.** Once the human logs in, the agent can fill the "Consumer Complaint (CC)" filing form, up to fee payment (Bharat Kosh / PayGov / SBI ePay) and the affidavit upload, then stop |
| Case status, judgments | e-jagriti.gov.in "CASE STATUS", "JUDGEMENT", "Cause List" | No | **Image CAPTCHA** | English | Partial: needs the human to solve the CAPTCHA |
| Find lawyer | barcouncilofindia.org / state bar councils | No | Varies | English | Weak: no specialism search exists (advertising ban) |
| Guideline lookup | clinicalestablishments.mohfw.gov.in STG PDF | No | No | English | **Yes**: download and quote p.36 |

**Blockers:**
- Every consumer, grievance and NCH portal uses **mobile OTP** and **image CAPTCHA**. NCH also requires an **Indian mobile number**.
- e-Jagriti is a 18 MB React single-page app: no server-rendered HTML, so it needs a real browser.
- Paid steps (e-Jagriti fee above ₹5 lakh consideration, RTI ₹10) must be left to the human.
- Some `.nic.in` hosts drop non-Indian IP addresses (see the network caveat at the top).
- Indian forms use cascading State → District → Taluka dropdowns that load by AJAX. The agent must wait after each choice.

**Hardest and most impressive browser task:** the **NALSA legal-aid application**. It is a long public form (66 fields) needing no login and no CAPTCHA:
- authority type (NALSA/SLSA/DLSA/TLSC) with cascading State/District/Taluka;
- applicant category (for example "Women" or "General (income below limit)");
- "Legal Service Type" = "Legal Advice" or "Panel Lawyer for filing new case";
- case type = "Other Civil Cases";
- opposite-party details: the hospital, its address and the Medical Superintendent;
- a free-text **summaryOfGrievance** describing the missed scaphoid fracture;
- an ID document type (Aadhaar, Voter ID, Ration card);
- optional photo and document uploads.

Stop before **Submit** (`btnSubmit`). The runner-up, if the human logs in first, is drafting the **e-Jagriti consumer complaint**: party details, the jurisdiction calculation by consideration paid, the cause-of-action date for s.69, prayer for compensation, and preparing the affidavit text.

## Sources
- MoHFW Charter of Patients' Rights (updated 23 Aug 2021): https://clinicalestablishments.mohfw.gov.in/sites/default/files/2023-06/3181.pdf (verified)
- MoHFW Standard Treatment Guidelines index: https://clinicalestablishments.mohfw.gov.in/standard-treatment-guidelines (verified); Orthopaedics STG: https://clinicalestablishments.mohfw.gov.in/sites/default/files/standard-treatment-guidelines/8611.pdf (verified)
- e-Jagriti: https://e-jagriti.gov.in/ (verified, JS app; strings read from its bundle `/static/js/main.fde312a2.js`)
- PIB, "e-Jagriti Wins Silver Award…", 07 Jun 2026: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2269994&reg=48&lang=1 (verified via curl; WebFetch returned 403)
- e-Daakhil (legacy): https://edaakhil.nic.in (broken from here; superseded)
- NCDRC: https://ncdrc.nic.in/ (verified); CONFONET https://confonet.nic.in (broken from here)
- CPA 2019 s.69: https://www.advocatekhoj.com/library/bareacts/consumerprotection2019/69.php (verified); s.36: https://www.advocatekhoj.com/library/bareacts/consumerprotection2019/36.php (verified); India Code https://indiacode.nic.in (verified home; Act handle broken from here)
- Pecuniary jurisdiction rules 2021 (SCC Online): https://www.scconline.com/blog/post/2022/01/03/pecuniary-jurisdiction-of-district-state-and-national-commissions-revised-vide-consumer-protection-jurisdiction-of-the-district-commission-the-state-commission-and-the-national-commission-rules-2/ (verified)
- CDRC (Amendment) Rules 2023 fee table: https://egazette.gov.in/WriteReadData/2023/248158.pdf (verified loads; table not parsed)
- *IMA v V.P. Shantha* (1995) 6 SCC 651: https://www.courtkutchehry.com/judgements/678455/indian-medical-association-vs-vp-shantha-and-others (verified)
- National Consumer Helpline: https://consumerhelpline.gov.in/public/ , /user/ , /user/signup.php (verified)
- CPGRAMS: https://pgportal.gov.in , https://pgportal.gov.in/Registration (verified); https://cpgrams.gov.in (broken from here)
- RTI Online: https://rtionline.gov.in , https://rtionline.gov.in/request/request.php (verified)
- NALSA: https://nalsa.gov.in (verified); LSMS legal-aid form https://scourtapp.nic.in/lsams/nologin/applicationFiling.action?requestLocale=en (verified); https://nalsa15100.in/ (verified); old https://nalsa.gov.in/lsams/ (broken, 404)
- Tele-Law: https://www.tele-law.in (verified); Nyaya Bandhu https://probono-doj.in (403 from here)
- NMC: https://www.nmc.org.in (verified); IMC Regulations 2002 page https://nmc.org.in/page/rules-regulations-rules-regulations-of-erstwhile-mci-code-of-medical-ethics-regulations-2002 (verified); EMRB appeal portal https://application.nmc.org.in/appeal (verified); NMC portal news https://medicaldialogues.in/health-news/nmc/nmc-launches-online-ethics-appeal-portal-for-doctors-175653 (verified)
- Nyaya explainer on SMC complaints: https://nyaaya.org/legal-explainer/complaining-against-a-medical-professional/ (verified)
- State medical councils: https://delhimedicalcouncil.org (verified, JS app); https://www.maharashtramedicalcouncil.in/ (verified, JS app); https://online.ukmedicalcouncil.org/complaint (broken: DNS); https://wbmc.wb.gov.in (broken from here)
- Bar Council of India: https://www.barcouncilofindia.org (verified)
- MoHFW: https://www.mohfw.gov.in (verified)
