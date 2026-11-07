# Germany (researched 2026-11-07)

Scope: a patient harmed by care at a **public** hospital (here: a large university or municipal hospital emergency department, the Notaufnahme, missed a scaphoid (Kahnbein) fracture; the patient now needs surgery) who wants (a) answers and an apology and (b) possibly compensation.
Every fact has an official source link. URL status: **verified** = fetched or curl returned 200 on 2026-11-07; **not verified** = not fetched or content not readable; **broken** = 404 or no response.

**Route in one line:** hospital complaints office (Beschwerdemanagement, phone/email/post) -> free expert report from the **Medizinischer Dienst** requested through the patient's **statutory health insurer** (Krankenkasse, §66 SGB V) and/or a free expert opinion from the **Gutachterkommission/Schlichtungsstelle of the regional Ärztekammer** (mostly via the folioNet online portal) -> negotiation with the hospital's liability insurer or a civil claim at the **Landgericht** (lawyer required), within **3 years** from the end of the year the patient learned of the error.

Germany has **no state ombudsman, no national complaints regulator for individual cases and no no-fault scheme** for hospital injury. Compensation is a private-law claim for breach of the treatment contract (§630a ff. BGB) and tort (§823 BGB) against the hospital operator (Träger). This is true even for publicly owned hospitals.

## 1. Which body runs the hospital, and how a patient finds out

- Hospitals have a **Träger** (operator): public (Land, municipality, or a public-law university hospital), non-profit (church, charity) or private. University hospitals such as Charité Berlin are Land-owned; there is no national hospital service.
- The patient's contract (and the claim) is with the Träger. In practice the Träger's liability insurer (Haftpflichtversicherer) handles the claim.
- How to find out: the hospital's own Impressum (legal notice) names the Träger. Public directories:
  - Deutsches Krankenhaus Verzeichnis (run by the German Hospital Federation). Each hospital profile has a "complaints management" tab with the complaints office and the patient advocate (Patientenfürsprecher). https://www.deutsches-krankenhaus-verzeichnis.de (verified). Example profile tab: https://dkgev-en.deutsches-krankenhaus-verzeichnis.de/app/portrait/3ff4cb412ffc176e/complaintsManagement (verified loads; it is a JS app, so the content was seen only in search snippets).
  - Bundes-Klinik-Atlas (Federal Ministry of Health hospital transparency site): https://bundes-klinik-atlas.de (verified loads; Träger field not checked).

## 2. Complaint to the provider

- **Legal duty:** hospitals must run patient complaints management. §135a(2) No. 2 SGB V requires hospitals to "einrichtungsintern ein Qualitätsmanagement einzuführen und weiterzuentwickeln, wozu in Krankenhäusern auch die Verpflichtung zur Durchführung eines patientenorientierten Beschwerdemanagements gehört." https://www.gesetze-im-internet.de/sgb_5/__135a.html (verified)
- **No national procedure, form, stages or response deadline.** Each hospital sets its own. Many Land hospital laws also require a volunteer **Patientenfürsprecher** (patient advocate) at each hospital (not verified per Land).
- **Examples:**
  - **Charité Berlin:** the central "Lob und Beschwerden" office (Klinisches Qualitäts- und Risikomanagement), Charitéplatz 1, 10117 Berlin. The page says these details are required: "Vollständiger Name (Vor- und Zuname), Geburtsdatum (der Patient:innen), Kontaktadresse (E-Mail / Adresse)". Contact is by email (lobundbeschwerden(at)charite.de, from a search snippet), post or in person. **No web form was found on the page.** https://qualitaetsmanagement.charite.de/metas/kontakt_fuer_lob_und_beschwerden/ (verified)
  - **LMU Klinikum München:** "Zentrales Beschwerdemanagement" handles "mündlichen und schriftlichen Patienten- und Angehörigenbeschwerden". Phone 089 4400-72132 at fixed hours. Emails with personal data are "sofort datenschutzkonform gelöscht", so an agent should **not** email health details there. No online form. https://www.lmu-klinikum.de/das-klinikum/zentrale-bereiche/lob-und-kritik/327e29fc4a76e466 (verified)
- **Login:** none. Some hospitals (e.g. UKE Hamburg, from a search snippet) have a public online "Ihre Meinung zählt" form; not verified.

## 3. Escalation: there is no ombudsman, so these are the two free expert routes

### 3a. Medizinischer Dienst (MD) expert report via the Krankenkasse (statutory insured only, about 90% of people)

- §66 SGB V: "Die Krankenkassen sollen die Versicherten bei der Verfolgung von Schadensersatzansprüchen, die bei der Inanspruchnahme von Versicherungsleistungen aus Behandlungsfehlern entstanden sind … unterstützen." Sentence 2 lists the support, including commissioning a socio-medical expert report from the Medizinischer Dienst. https://www.gesetze-im-internet.de/sgb_5/__66.html (verified)
- **Cost:** MD Bund says the review is done "im Auftrag der gesetzlichen Krankenkasse des Betroffenen", is "interessenneutral" and is "für den Versicherten kostenlos". https://md-bund.de/fuer-patienten/behandlungsfehler.html (verified)
- **How to start:** MD Berlin-Brandenburg advises writing a memory record (Gedächtnisprotokoll) and then "Sprechen Sie dann mit einem Mitarbeiter oder einer Mitarbeiterin Ihrer Krankenkasse." The insurer "beschafft die notwendigen Unterlagen". https://www.md-bb.org/versicherte/behandlungsfehler (verified)
- **The patient cannot apply to the MD directly.** The application goes through the Krankenkasse.
- **AOK example:** the insurer needs a "Schweigepflichtentbindungserklärung und Herausgabegenehmigung" (release from confidentiality and permission to obtain records) plus a Gedächtnisprotokoll covering treatment, clinicians, dates, harm, current symptoms and witnesses. The AOK pays for the reports it commissions, but "Kosten für die Rechtsvertretung und/oder Prozesskosten kann die AOK nicht für Sie übernehmen." https://www.aok.de/pk/dokumente-vollmachten-patientenrechte/behandlungsfehler/ (verified)
- **TK example:** an online "Behandlungsfehler-Wegweiser" plus a hotline. https://www.tk.de/bf-wegweiser (verified loads; it redirects to a JS app at tk.de/service/app/2002890/wwbehandlungsfehler/; content not inspected)
- **Scale:** in 2025 the MD produced 11,735 expert reports on suspected treatment errors (MD Bund press release of 20 Aug 2026, via search snippet). https://md-bund.de/fileadmin/dokumente/Pressemitteilungen/2026/2026_08_20/1_FIN_PM_BHF_20.08.26.pdf (verified loads; PDF text not extracted)
- **Privately insured patients** have no §66 route. This is an inference from §66 applying to statutory insurers only.

### 3b. Gutachterkommission / Schlichtungsstelle of the Landesärztekammer (regional medical chamber)

- **One body per chamber region, 17 in total.** The official directory is run by the Bundesärztekammer: https://www.aerztekammern-schlichten.de/kontakt (verified). The old bundesaerztekammer.de page 301-redirects to https://www.aerztekammern-schlichten.de/ (verified).
- **The "Norddeutsche Schlichtungsstelle" (Hannover) closed on 31.12.2021.** Each northern chamber now runs its own body. The Ärztekammer Berlin says it continues the Hannover body's pending cases. The pointer in the brief is therefore out of date.
- **Cost:** "Das Verfahren … ist für Patientinnen und Patienten kostenfrei." Each party pays its own lawyer. The result is "nicht rechtsverbindlich" (a recommendation only), and court remains open afterwards. https://www.aerztekammern-schlichten.de/ and /faq (verified)
- **Consent:** it is voluntary for the hospital side. Berlin says "Eine Voraussetzung für die Durchführung des Schlichtungsverfahrens ist die Zustimmung aller Verfahrensbeteiligten." Bavaria says the doctor or hospital **and** its liability insurer must agree, and that the Gutachterstelle obtains these consents.
- **Time limit:** usually the events must be no more than **5 years** old (stated by Bavaria and Nordrhein).
- **Pending cases:** Nordrhein does not act while a court case or criminal investigation on the same matter is pending.
- **Duration:** about **12 months** in Nordrhein ("Die durchschnittliche Bearbeitungszeit beträgt derzeit etwa 12 Monate"); about **18 months** in Bavaria.
- **Limitation pause:** the limitation period is suspended (§204(1) No. 4 BGB), and the suspension ends 6 months after the procedure ends (§204(2)). https://www.gesetze-im-internet.de/bgb/__204.html (verified)
- **Channels by chamber** (checked 2026-11-07):

| Chamber (example Land) | Channel | URL (status) |
|---|---|---|
| Bayern (Bavaria) | **folioNet online portal, account required**, paper only by exception | https://www.blaek.de/patient/gutachterstelle/ (verified); portal https://gutachterstelle-in-bayern.de/app/ (verified) |
| Berlin | folioNet portal, account required | https://www.aekb.de/patient-innen/schlichtungsverfahren (verified); portal https://schlichtungsverfahren.aekb.de/app (verified) |
| Niedersachsen (Lower Saxony) | folioNet portal (online since 01.01.2023); informal email or post also accepted | https://www.aekn.de/patientinnen-und-patienten/schlichtungsstelle (verified); register page https://www.schlichtungsstelle-niedersachsen.de/app/users/register (verified) |
| Brandenburg, Sachsen-Anhalt, Bremen, Baden-Württemberg, Westfalen-Lippe, Schleswig-Holstein, Mecklenburg-Vorpommern | folioNet or "Online-Portal" named on the chamber page | e.g. https://gutachterstelle.laekb.de/app, https://sst.aeksa.de/app/, https://schlichtungsstelle.aeksh.de/app/ (all verified loads) |
| **Nordrhein** (Düsseldorf, Köln) | **PDF forms "zum Herunterladen und Ausfüllen am Computer"**, sent by post. No portal, no login. | https://www.aekno.de/patienten/behandlungsfehler/antragsunterlagen (verified); application form https://www.aekno.de/fileadmin/user_upload/aekno/downloads/2023/gak-antrag-2023-09.pdf (verified); consent and confidentiality release https://www.aekno.de/fileadmin/user_upload/aekno/downloads/2023/gak-einwilligung-2023-09.pdf (verified) |
| Rheinland-Pfalz | PDF application form (gesamt_schlichtungsantrag.pdf linked) | http://www.laek-rlp.de/ausschuesse-kommissionen/schlichtungsausschuss/ (verified) |
| Hamburg, Hessen, Sachsen, Saarland, Thüringen | not classified | URLs listed at aerztekammern-schlichten.de/kontakt (all returned 200) |

- **What Nordrhein asks for:** name, date of birth and address; the doctor's name and address, or for a hospital at least the hospital, department and chief physician; the facts, including the reason and date of treatment, the suspected error and the resulting harm; and any discharge letters, operation reports or X-rays. The signed consent form is mandatory.

## 4. Compensation route

- **No no-fault scheme for hospital injury.** It is a fault-based civil claim against the Träger (and/or the doctors).
- **Court:** the Landgericht hears all such claims regardless of value. §71(2) No. 9 GVG gives it exclusive jurisdiction "in Streitigkeiten aus Heilbehandlungen". https://www.gesetze-im-internet.de/gvg/__71.html (verified)
  - The Amtsgericht value limit (now €10,000, §23 No. 1 GVG) does not apply. https://www.gesetze-im-internet.de/gvg/__23.html (verified)
  - A lawyer is mandatory at the Landgericht (§78 ZPO, not fetched).
- **Burden of proof (relevant to a missed fracture):**
  - §630h(5) sentence 1 BGB: for a **gross** error, causation is presumed.
  - §630h(5) sentence 2 BGB: the presumption also applies "wenn es der Behandelnde unterlassen hat, einen medizinisch gebotenen Befund rechtzeitig zu erheben oder zu sichern", if the finding would probably have prompted action and not acting would have been a gross error. This is the "Befunderhebungsfehler" doctrine, the typical argument when imaging or follow-up for a suspected scaphoid fracture was omitted. https://www.gesetze-im-internet.de/bgb/__630h.html (verified)
- **No pre-action protocol.** In practice the patient writes to the hospital or its insurer with a deadline, then goes to Schlichtung or the MD, then to court.
- **Limitation:**
  - §195 BGB: "Die regelmäßige Verjährungsfrist beträgt drei Jahre." https://www.gesetze-im-internet.de/bgb/__195.html (verified)
  - §199(1) BGB: the period runs "mit dem Schluss des Jahres", in which the claim arose and the claimant learned, or without gross negligence should have learned, of the circumstances and the debtor. Example: a patient who learns in March 2026 has until **31.12.2029**.
  - Absolute long-stop for injury to health: **30 years** (§199(2)). https://www.gesetze-im-internet.de/bgb/__199.html (verified)
  - Negotiations (§203) and Schlichtung (§204(1) No. 4) pause the clock.

## 5. Funding

- **Beratungshilfe** (legal advice aid for people on low incomes; advice outside court, applied for at the Amtsgericht):
  - Official online service: "Im Vorab-Check können Sie in 5 Minuten testen, ob Sie die Voraussetzungen für Beratungshilfe erfüllen" (an eligibility checker with no login).
  - "Antrag online ausfüllen … Sie werden Schritt für Schritt in einfacher Sprache durch alle Abfragen geführt. Mit Ihren Antworten erstellen wir den Antrag." The finished application is submitted by post, in person, or via "Mein Justizpostfach". Mein Justizpostfach uses **BundID** login; the page config points to id.bund.de.
  - https://service.justiz.de/beratungshilfe (verified); https://service.justiz.de/beratungshilfe/beratungshilfeschein (verified)
- **Prozesskostenhilfe (PKH, court legal aid):** applied for at the court with a mandatory statutory form, the "Erklärung über die persönlichen und wirtschaftlichen Verhältnisse" (statement of personal and financial circumstances). There is an online fill-in assistant at https://service.justiz.de/link/pkh, which redirects to /prozesskostenhilfe/direktlink (verified). The PDF form is at https://service.justiz.de/Erklaerung_Prozesskostenhilfe.pdf (verified).
- **No win, no fee (Erfolgshonorar):** restricted by §4a(1) RVG. It is allowed only for money claims up to €2,000, debt collection, or where the client "bei verständiger Betrachtung ohne die Vereinbarung eines Erfolgshonorars von der Rechtsverfolgung abgehalten würde". https://www.gesetze-im-internet.de/rvg/__4a.html (verified)
  - In practice, **legal expenses insurance (Rechtsschutzversicherung)** and PKH fund most claims. This is general knowledge, not sourced.

## 6. Finding a lawyer

- **Official register: Bundesweites Amtliches Anwaltsverzeichnis** (Federal Bar, BRAK), "Official Nationwide Register Of Lawyers". https://bravsearch.bea-brak.de/bravsearch/ (verified; www.bea-brak.de/bravsearch/index.brak redirects here)
  - Search fields: title (Herr/Frau), academic title, last name, first name, professional title, **"Professional subtitle" (Fachanwaltsbezeichnung) dropdown including "Medizinrecht"**, office name, street, **post code**, **city**, bar (28 regional bars plus the BGH bar), and a public-defender checkbox. It is available in German and English.
  - It is a PrimeFaces/JSF app with AJAX dropdowns. **No CAPTCHA was found in the HTML.**
- **Fachanwalt für Medizinrecht** (specialist lawyer in medical law) is granted by the regional bar (§43c BRAO). For example, RAK Frankfurt requires 60 medical-law cases in 3 years (search snippet). The register search above is the official way to filter by it.
- **Non-official directories:** DAV "Anwaltauskunft" https://anwaltauskunft.de/anwaltssuche (verified, redirects to /suche/?type=lawyer); Arbeitsgemeinschaft Medizinrecht im DAV https://www.arge-medizinrecht.de (verified loads).
- **Patient-side versus doctor-side lawyers:** the Fachanwalt title does not distinguish them. Firm websites say whether they act "auf Patientenseite".

## 7. Clinical guidelines body

- **AWMF** (Association of the Scientific Medical Societies) runs the national guideline register. https://www.awmf.org/leitlinien (verified)
- **S3-Leitlinie "Skaphoidfraktur", AWMF register no. 012-016**, October 2015.
  - Secondary sources describe it as "gültig bis 09/2020", i.e. expired.
  - Secondary reviews summarise the guideline as follows: if radiographs (dorsopalmar, lateral, Stecher view) are negative or inconclusive, CT or MRI should be done early, and up to about 30% of acute scaphoid fractures are missed on plain X-ray (Thieme/Springer reviews via search).
  - A new S3 guideline is reportedly registered as **187-070** (August 2025, planned December 2028); one non-official source, **not verified**.
  - Register page: https://register.awmf.org/de/leitlinien/detail/012-016. It returns 200 but serves an **Anubis proof-of-work bot wall ("Making sure you're not a bot!")**, so the content could not be fetched (not verified).
- **G-BA** (Federal Joint Committee) sets quality-management rules, not clinical guidance: https://www.g-ba.de (verified loads).

## 8. Free advice and advocacy

- **Stiftung Unabhängige Patientenberatung Deutschland (UPD):** it was re-founded as a foundation, and counselling restarted in May 2024 (search snippets).
  - Free phone **0800 011 77 22**: Mon/Tue 9-12 and 14:30-17, Wed 9-14, Thu 9-12 and 14-18, Fri 9:30-14.
  - "Behandlungsfehler" is a listed topic.
  - Written advice through a "sicheres Online-Portal". It needs only "Internetzugang und eine E-Mail-Adresse", accepts a "Pseudonym", and takes uploads as "PDF, PNG oder JPG". It has been available since 13 April 2026 (search snippet).
  - Local offices exist in Berlin, Bielefeld, Dresden, Köln and elsewhere.
  - https://patientenberatung.de/ (verified); https://patientenberatung.de/beratungsangebot/schriftliche-beratung/ (verified); portal https://onlineberatung.patientenberatung.de/ (verified loads; a JS SPA, so registration flow not inspected)
- **Federal Patients' Commissioner (Patientenbeauftragter der Bundesregierung): Stefan Schwartze**, reappointed 3 June 2025. His role is policy (§140h SGB V), **not individual complaints**, and he refers people to the UPD. https://patientenbeauftragter.de/ (verified); contact page https://patientenbeauftragter.de/kontakt/ (verified loads). The domain is patientenbeauftragter.de; **patientenbeauftragte.de does not resolve (broken)**.
- **Others:**
  - The patient's own Krankenkasse (see 3a).
  - Hospital Patientenfürsprecher.
  - Verbraucherzentralen (consumer advice centres): https://www.verbraucherzentrale.de (verified loads).
  - Federal Ministry of Health citizens' line (Bürgertelefon) page on patient rights: https://www.bundesgesundheitsministerium.de/service/buergertelefon/patientenrechte-und-behandlungsfehler/ (search result, not fetched).

## 9. Medical records access

- **§630g(1) BGB:** "Dem Patienten ist auf Verlangen unverzüglich Einsicht in die vollständige, ihn betreffende Behandlungsakte zu gewähren." The patient may also ask for copies, "einschließlich elektronischer Abschriften". The current text makes the **first copy free**, and §630g(4) keeps GDPR rights intact (Art. 15 GDPR: free copy). A refusal "ist zu begründen" (must give reasons). https://www.gesetze-im-internet.de/bgb/__630g.html (verified)
- **Retention:** records are kept for 10 years after treatment ends (§630f(3) BGB). https://www.gesetze-im-internet.de/bgb/__630f.html (verified)
- **Process:** a written request (letter or email) to the hospital, usually its records department or the department's secretariat. There is no national online form. X-ray images come on CD/DVD; Berlin's Schlichtungsstelle asks for CDs by post.

## 10. Browser-agent notes

| Step | On a website without login? | Form type | Login / ID | CAPTCHA / bot wall | Language |
|---|---|---|---|---|---|
| Identify hospital Träger and complaints office | Yes | Search (Deutsches Krankenhaus Verzeichnis, Bundes-Klinik-Atlas, hospital Impressum) | none | none seen; JS apps | DE (DKV also EN) |
| Complain to hospital | Mostly **no web form**. Charité and LMU: email, phone or post only. Some hospitals (e.g. UKE) have a public form. | Agent can **draft the email or letter** | none | n/a | DE |
| MD report via Krankenkasse | **No public form.** Patient phones or writes to their insurer; some insurers use an online guide (TK) or a member portal ("Meine AOK", "Meine TK") | Agent drafts the Gedächtnisprotokoll and covering letter; the insurer sends the consent form | insurer portals need the insurer's own account/2FA | n/a | DE |
| Schlichtung, folioNet chambers (Bayern, Berlin, Niedersachsen, BW, Brandenburg, Sachsen-Anhalt, Bremen, WL, SH, MV) | **No.** Must create an account | Multi-step online application with eligibility questions and uploads (folioNet) | **folioNet account**: username, password, **mobile number "für die Zusendung von Sicherheitscodes"** (SMS 2FA; BW publishes a "Zwei-Faktor-Authentifizierung_folionet.pdf") | **Image CAPTCHA ("Verifikationscode … in dem Bild erkennbaren")** on the registration form (all three portals checked) | DE only |
| Schlichtung, **Nordrhein** (Düsseldorf/Köln) and Rheinland-Pfalz | **Yes**: download and fill the PDF forms, then post them | Fillable PDF (application plus signed consent) | none | none | DE |
| Beratungshilfe eligibility check and online application | **Yes** (Vorab-Check and step-by-step builder) | Multi-step form producing an application; submission by post/in person, or via Mein Justizpostfach | **BundID** only for digital submission | none seen | DE (plain-language option) |
| PKH form | Yes (online assistant or PDF) | Multi-step | none to fill | none seen | DE |
| Find a Fachanwalt für Medizinrecht | **Yes** (official BRAK register) | Search form: "Medizinrecht" dropdown, post code/city, bar | none | **none found** (PrimeFaces AJAX; needs real dropdown clicks, not URL params) | DE/EN |
| UPD written advice | Partly: account or pseudonym plus email (registration not inspected) | Free text plus uploads | email-based | unknown | DE |
| AWMF guideline lookup | Yes, but behind a bot wall | Read | none | **Anubis JS proof-of-work** ("Making sure you're not a bot!"). A real headless browser with JS usually passes; curl and WebFetch do not | DE |

**Hardest, most impressive browser task:** use the **official BRAK register** to find a **Fachanwalt für Medizinrecht** near the patient's post code.
- Steps: switch to English or German, pick "Medizinrecht" from the PrimeFaces "Professional subtitle" dropdown, enter the post code or city, choose the regional bar, page through results, and open profiles.
- Then download the **Nordrhein Gutachterkommission application PDF** (gak-antrag-2023-09.pdf) and fill it with the case: hospital, department, chief physician, date of the Notaufnahme visit, the missed scaphoid fracture, the later surgery, and the harm. Also fill the consent PDF. **Stop before printing, signing or posting.**
- For a chamber that uses folioNet (e.g. Bavaria or Berlin), the agent can go only as far as **pre-filling the registration page**. It must then hand over to the human for the image CAPTCHA and the SMS security code, and it must not create the account.

**Blockers:**
- folioNet image CAPTCHA plus SMS 2FA in most chambers.
- BundID for Mein Justizpostfach.
- Insurer member-portal logins.
- Anubis bot wall on the AWMF register.
- Most hospitals have no online complaint form, only email or post.
- Everything is in German.

## Sources

- §66 SGB V https://www.gesetze-im-internet.de/sgb_5/__66.html (verified)
- §135a SGB V https://www.gesetze-im-internet.de/sgb_5/__135a.html (verified)
- §§195, 199, 204, 630f, 630g, 630h BGB https://www.gesetze-im-internet.de/bgb/ (each __NNN.html verified)
- §§23, 71 GVG https://www.gesetze-im-internet.de/gvg/__71.html, https://www.gesetze-im-internet.de/gvg/__23.html (verified)
- §4a RVG https://www.gesetze-im-internet.de/rvg/__4a.html (verified)
- Bundesärztekammer Schlichtung portal https://www.aerztekammern-schlichten.de/ , /kontakt , /faq (verified)
- Bayern https://www.blaek.de/patient/gutachterstelle/ (verified); https://gutachterstelle-in-bayern.de/app/ (verified)
- Berlin https://www.aekb.de/patient-innen/schlichtungsverfahren (verified); https://schlichtungsverfahren.aekb.de/app (verified)
- Niedersachsen https://www.aekn.de/patientinnen-und-patienten/schlichtungsstelle (verified); https://www.schlichtungsstelle-niedersachsen.de/app/ (verified)
- Nordrhein https://www.aekno.de/patienten/behandlungsfehler and /antragsunterlagen (verified); https://www.aekno.de/patienten/gutachterkommission (**broken, 404**)
- MD Bund https://md-bund.de/fuer-patienten/behandlungsfehler.html (verified); https://md-bund.de/themen/behandlungsfehler (**broken, 404**)
- MD Berlin-Brandenburg https://www.md-bb.org/versicherte/behandlungsfehler (verified)
- Medizinischer Dienst overview https://www.medizinischerdienst.de/versicherte/behandlungsfehler/ (verified). www.medizinischer-dienst.de has a **TLS certificate error (broken)**.
- AOK https://www.aok.de/pk/dokumente-vollmachten-patientenrechte/behandlungsfehler/ (verified)
- TK https://www.tk.de/bf-wegweiser (verified loads)
- UPD https://patientenberatung.de/ (verified); https://onlineberatung.patientenberatung.de/ (verified loads)
- Patientenbeauftragter https://patientenbeauftragter.de/ (verified)
- BRAK register https://bravsearch.bea-brak.de/bravsearch/ (verified)
- Justiz-Services https://service.justiz.de/beratungshilfe (verified); https://service.justiz.de/link/pkh (verified)
- Charité https://qualitaetsmanagement.charite.de/metas/kontakt_fuer_lob_und_beschwerden/ (verified)
- LMU https://www.lmu-klinikum.de/das-klinikum/zentrale-bereiche/lob-und-kritik/327e29fc4a76e466 (verified)
- AWMF https://www.awmf.org/leitlinien (verified); https://register.awmf.org/de/leitlinien/detail/012-016 (bot wall, content not verified)
- Deutsches Krankenhaus Verzeichnis https://www.deutsches-krankenhaus-verzeichnis.de (verified)
