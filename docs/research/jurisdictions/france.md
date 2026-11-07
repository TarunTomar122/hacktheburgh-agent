# France (researched 2026-11-07)

Scope: a patient harmed by care at a **public** hospital (case: the emergency department (*urgences*) of a public hospital (*centre hospitalier*, CHU, AP-HP) missed a scaphoid fracture; the patient now needs surgery) who wants (a) answers and an apology and (b) possibly compensation.
URL status was checked on 2026-11-07 with `curl -sL` (HTTP code) and/or WebFetch. **verified** = loads (200) with the expected content; **not verified** = blocked for our client (403 or connection reset) or not fetched; **broken** = 404.
Language everywhere: **French only** (no English versions of the forms).

**Route in one line:** written complaint to the hospital director → *médiateur médecin* + *Commission des usagers (CDU)* → (optional) ARS complaint → compensation: either the free **CCI** (via ONIAM; PDF form posted by recorded delivery) or a **demande préalable indemnitaire** to the hospital, then the **tribunal administratif** (lawyer needed). Limitation: **10 years from consolidation**.

---

## 1. Which body runs the hospital, and how a patient finds out

- Public hospitals are *établissements publics de santé*: separate legal entities, each with a director who is its legal representative. The regional health agency (**ARS**) oversees them. Disputes about a public hospital's liability go to the **administrative courts**, not the civil courts. Service-public says of a CCI dispute: "Hôpital public : le recours … se fait devant le tribunal administratif ; établissement privé : … tribunal judiciaire" ([F13318](https://www.service-public.gouv.fr/particuliers/vosdroits/F13318), verified).
- **How a patient checks public or private status:** the FINESS national register of establishments shows each establishment's legal status and category: https://finess.esante.gouv.fr/ (verified, 200). The welcome booklet (*livret d'accueil*) or the hospital's website names the CDU and the *chargé des relations avec les usagers*.
- **Example:** Paris public hospitals are run by AP-HP, which has its own online services (see §2 and §9): https://www.aphp.fr/mes-demarches-en-ligne (verified).

## 2. Complaint to the provider

Sources: [service-public F10256 "Commission des usagers d'un hôpital ou d'une clinique"](https://www.service-public.gouv.fr/particuliers/vosdroits/F10256) (verified); [sante.fr "Quelles voies de recours…"](https://www.sante.fr/quelles-voies-de-recours-pour-porter-une-reclamation-sur-un-soin-ou-une-prise-en-charge) (verified). Legal basis: CSP art. R1112-79 to R1112-94 (Légifrance blocks curl with a 403; not verified directly).

- **Stages:**
  1. Raise it orally with the head of department (*chef de service*). This is optional.
  2. Send a written complaint to the hospital's legal representative (the director). Service-public: you can "adresser directement une plainte ou réclamation écrite au représentant légal de l'hôpital".
  3. The director refers the complaint to a **mediator**, or tells the patient they can refer it themselves. For complaints about "l'organisation des soins ou le fonctionnement médical du service", the mediator is the **médiateur médecin** (a doctor). For anything else, it is the non-medical mediator (sante.fr / justice.fr wording). The doctor-mediator needs the patient's written consent to read the medical file.
  4. The mediator meets the patient: "le médiateur doit vous rencontrer dans les 8 jours". The mediator then reports to the CDU president within 8 days of the meeting.
  5. The CDU reviews complaints at least quarterly. Within 8 days of the CDU meeting, the director must reply in writing and attach the CDU's opinion.
- **Online form?** There is no national form. Most hospitals take complaints by letter or email; some offer a website contact form.
  - AP-HP "Faire un témoignage" form: https://www.aphp.fr/form/contact (verified). It has **reCAPTCHA** and no login.
  - The *demande préalable* for compensation is separate, see §4.
- **Time limit:** none for the complaint itself.
- **Ordre des médecins (disciplinary):**
  - For a **hospital doctor acting in their public-service role**, CSP **L4124-2** says that only the health minister, the ARS director general, the public prosecutor (*procureur*) or the CDOM/CNOM can bring the case before the disciplinary chamber. **A patient's own disciplinary complaint is not admissible.** The patient can ask the CDOM to act.
  - The CNOM explanatory leaflets for complainants on L4124-2 are now **broken (404)**. The sante.fr page on complaints to the professional orders describes the general (private-doctor) route: https://www.sante.fr/node/135929 (redirects; verified).
  - The Ordre "ne donne droit à aucune indemnisation".

## 3. Escalation: regulator / ombudsman

- **ARS (regional health agency).** First approach the establishment ("Adressez-vous en premier lieu … au directeur de l'établissement").
  - What the ARS **cannot** do: give medical expertise, decide whether there was a fault, or handle compensation.
  - Île-de-France page: https://www.iledefrance.ars.sante.fr/comment-deposer-une-reclamation (verified).
  - Online form (national platform *Démat Social*): **"Santé et social : faire une réclamation ou un signalement"**, https://demat.social.gouv.fr/commencer/sante-social-signaler. **Verified via WebFetch, but curl gets a "Request Rejected" WAF page.** It is multi-page and the start page estimates "environ 28 minutes".
  - **Login:** you must create a Démat Social account (or sign in) before you can start. Not anonymous: "anonymous complaints cannot be processed".
  - Other regions use the same platform with different paths. For example, the Bretagne form is at /commencer/formulaire-de-reclamation-ars (not verified).
- **Défenseur des droits** (handles complaints about public services, which includes public hospitals; e.g. refused access to the medical file or billing). It **cannot judge medical care**: decision 2025-217 says it cannot "remettre en cause un avis médical".
  - Online form, no login seen: https://formulaire.defenseurdesdroits.fr/formulaire_saisine/?ETAPE=accueil_2016 (verified).
  - Step 1 is checkboxes for the reason (choose "UN PROBLEME AVEC UNE ADMINISTRATION OU UN SERVICE PUBLIC"). The step 1 HTML has no CAPTCHA; later steps were not inspected (we did not submit).
  - Phone 09 69 39 00 00.
- **Adverse-event report (not a complaint):** portal https://signalement.social-sante.gouv.fr/ (verified). HAS explains serious adverse events (*EIGS*): https://has-sante.fr/jcms/c_2787338/fr/declarer-les-evenements-indesirables-graves-associes-aux-soins-eigs (verified). The ARS says reporting is "à ne pas confondre" with a complaint.
- **No health-specific ombudsman exists in France.**

## 4. Compensation route

### A. CCI (Commission de conciliation et d'indemnisation), run with ONIAM. Free, no lawyer needed.

Sources: [service-public F13318](https://www.service-public.gouv.fr/particuliers/vosdroits/F13318) (verified); [oniam.fr/accidents-medicaux](https://www.oniam.fr/accidents-medicaux) (verified); [oniam.fr/procedure-indemnisation](https://www.oniam.fr/procedure-indemnisation) (verified).

- **Severity threshold** (CSP L1142-1 II and D1142-1), quoted from service-public. The claim qualifies if **any one** of these is met:
  - "Un taux d'atteinte permanente à l'intégrité physique ou psychique supérieur à 24 %" (permanent impairment, *AIPP*, over 24%).
  - Time off work (*arrêt temporaire des activités professionnelles*) of **at least 6 consecutive months, or 6 non-consecutive months within 12 months**.
  - Temporary functional deficit (*DFT*) of **≥ 50 % for at least 6 months** (consecutive or not, within 12 months).
  - Exceptionally: permanent inability to do one's job, or "troubles particulièrement graves … dans les conditions d'existence".
  - **Below the threshold, the CCI can only offer conciliation**: "sous 24 %, la CCI oriente vers la conciliation" ([demande de conciliation](https://www.oniam.fr/procedure-indemnisation/demande-conciliation), verified).
  - **For our case:** a missed scaphoid fracture needing surgery usually leaves a low AIPP. It reaches the threshold only through ≥ 6 months off work or the exceptional criteria. Otherwise the realistic route is B.
- **Fault vs no-fault:**
  - If the CCI finds hospital fault, the hospital's insurer must make an offer within **4 months** of the CCI's opinion.
  - If it finds a non-fault medical accident (*aléa thérapeutique*) above the threshold, **ONIAM** pays under national solidarity.
  - If the insurer stays silent or refuses, the victim can turn to ONIAM by recorded-delivery letter (*LRAR*) (F13318).
- **Timeline:** CCI opinion within **6 months** of the complete file. Medical expertise is free and *contradictoire* ("Cette expertise est gratuite et contradictoire"). Only acts after 5 Sept 2001 are covered.
- **Form:** "Formulaire de demande d'indemnisation auprès de la CCI", version 13/09/2021. It is **not a cerfa-numbered form on ONIAM's site**; the older cerfa 12245*03 is superseded.
  - PDF: https://www.oniam.fr/medias/uploads/formulaire%20CCI%202021/Formulaire_%20CCI.pdf (verified, 200, application/pdf). Also linked from [service-public R1459](https://www.service-public.gouv.fr/particuliers/vosdroits/R1459) (verified).
  - **4 pages, a fillable AcroForm with 95 fields** (checked with pypdf). Sections:
    - the victim's civil status, social-security body and number, top-up health insurer (*mutuelle*), and employment situation;
    - the claimant if not the victim;
    - up to 5 health actors involved (name and address) and the dates of the medical acts;
    - any court proceedings already under way;
    - damage and losses (free text);
    - signature.
  - Supporting-documents checklist (*fiche pratique*): https://www.oniam.fr/medias/uploads/FICHES%20PRATIQUES%20MONTREUIL/FICHES/Fiche%20pratique%20AM%20au%2030.03.2021.pdf (verified). It asks for: a medical document linking the damage to the act; a recent medical certificate describing the damage and its severity; proof of social security; evidence of the losses; and any sums received from other bodies.
- **How to send:** **there is no online filing.** From the form: "Adressez votre dossier par lettre recommandée avec accusé de réception à la commission … correspondant au lieu de réalisation de l'acte médical … ou déposez-le au secrétariat de la commission contre récépissé."
- **Finding the right CCI:** https://www.oniam.fr/trouver-ma-commission (verified). It is a JS region dropdown; the addresses are embedded as JSON in the page. Île-de-France entry: CCI d'Ile de France, Tour Altaïs, 1 place Aimé Césaire, CS 80011, 93102 Montreuil Cedex, tél 01.49.93.89.20, idf@commissions-crci.fr. Other CCI offices are in Lyon (235 cours Lafayette), Bordeaux (50 rue Nicot) and Nancy (3 rue de Turique).
- **ONIAM contact form:** https://www.oniam.fr/contact (verified). It has **reCAPTCHA** and is only for questions, not claims.

### B. Claim against the public hospital itself (fault-based), then the administrative court

- **Step 1: *demande préalable indemnitaire*.** A written claim for a sum of money, sent to the hospital director (recorded delivery). The court case is inadmissible without it. Many 2023–2026 tribunal administratif orders reject claims "faute de justifier d'une demande préalable".
- **Silence for 2 months = implied rejection.** The patient then has 2 months to file at the tribunal administratif. Caveat: the 2-month deadline is only enforceable if the acknowledgment or the decision stated the appeal deadlines (CRPA L112-6; see the "délais" point on [service-public F2640](https://www.service-public.gouv.fr/particuliers/vosdroits/F2640), verified). Example: a TA Paris 2026 rejection for filing more than 2 months after AP-HP's reply.
- **AP-HP has an online *réclamation indemnitaire*:** https://reclamation-indemnitaire.aphp.fr/. Not verified: it returns **403 to curl**, a bot wall or geo-block. Per [aphp.fr/mes-demarches-en-ligne](https://www.aphp.fr/mes-demarches-en-ligne) (verified), it needs an *espace demandeur* account **or FranceConnect+**: "Je m'identifie à mon espace demandeur ou je me connecte avec FranceConnect+".
- **Court:** tribunal administratif. Online filing via **Télérecours citoyens**, https://citoyens.telerecours.fr/ (verified 200). It requires an account or FranceConnect; user reports describe FranceConnect account-duplication bugs.
  - **A lawyer is mandatory** when the claim "concerne une somme d'argent" (F2640; CJA R431-2).
  - A *référé-expertise* (CJA R532-1) is commonly used to get a court expert appointed.
- **CCI and court can run in parallel.** The CCI must be told about any court case, and filing with the CCI suspends limitation (CSP L1142-7).

### Limitation

- **CSP L1142-28:** actions against health professionals and **public or private** health establishments "se prescrivent par dix ans à compter de la consolidation du dommage". F13318: "Il faut agir dans un délai de 10 ans à compter de la consolidation du dommage."
- The CCI is "pas un préalable obligatoire" to going to court (ONIAM annual report 2025).

### Criminal

A criminal complaint (*plainte pénale*) for *blessures involontaires* is possible, but rarely useful for a missed fracture.

## 5. Funding

- **Legal aid (*aide juridictionnelle*, AJ).** Source: [service-public F18074](https://www.service-public.gouv.fr/particuliers/vosdroits/F18074) (verified; checked 12 June 2026). Income ceilings by tax reference income (*RFR*), single person:
  - **total AJ ≤ €12,957**;
  - 55% partial AJ: €12,958–15,316;
  - 25% partial AJ: €15,317–19,433.
- **Simulator:** https://www.aidejuridictionnelle.justice.fr/simulateur (200; JS-only, content not readable by fetch). No login indicated. The older https://www.justice.fr/simulateurs/aide-juridictionnelle showed a **"site en maintenance"** page on 2026-11-07.
- **Online application (SIAJ):** https://www.aidejuridictionnelle.justice.fr/authentification (verified 200). [R66463](https://www.service-public.gouv.fr/particuliers/vosdroits/R66463) (verified) says "Connexion via France Connect".
  - **Only for proceedings before the civil and criminal courts** (*juridictions judiciaires*). CNB, 31 Oct 2025: administrative courts are only "une expérimentation … pour certaines juridictions administratives".
  - **For a public hospital case (tribunal administratif) the paper form cerfa 16146 is normally used**: [R1444](https://www.service-public.gouv.fr/particuliers/vosdroits/R1444) (verified).
  - The online service is only for people whose main residence is in France.
- **Legal-expenses insurance (*protection juridique*)** in home or credit-card insurance often covers medical claims. Check the policy.
- **No-win-no-fee:** a fee based *only* on the result (*pacte de quota litis*) is **prohibited** in France. A fixed fee plus a success fee (*honoraire de résultat*) is allowed (Loi 71-1130 art. 10; not fetched).
- The **CCI is free**, including its expert.

## 6. Finding a lawyer

- **CNB national directory:** https://www.cnb.avocat.fr/fr/annuaire-des-avocats-de-france (verified). It shows "78 938 avocats". The search is an **iframe** of https://e-annuaire.avocat.fr/, which is **not verified (connection reset to curl and WebFetch; likely a WAF or geo-block)**. Its search fields could not be inspected.
- **CNB consultation platform** (data controller CNB): https://consultation.avocat.fr/ (verified).
  - Search form fields (from the HTML):
    - `name` ("Nom et/ou prénom");
    - `address` ("Où ? adresse, ville, code postal", with geolocation);
    - `competencepublic1` / `competencepublic2` (area of law → sub-area);
    - checkbox `specialists` ("avocats spécialistes" only);
    - `language`.
  - No CAPTCHA was seen. Relevant competence: **"Droit des assurances, du dommage corporel et de la santé" → "Mise en cause de la responsabilité médicale et indemnisation"** (also "Défense des victimes d'accident et réparation du préjudice corporel").
  - Browse by specialism: https://consultation.avocat.fr/avocats/par-specialisation.php (200). Lists "Droit de la santé" and "dommage corporel".
  - Paid online consultations "à partir de 30 €". The user account is optional (FranceConnect is offered).
- **Accreditation:** only holders of a CNB **certificat de spécialisation** may call themselves "avocat spécialiste". Relevant mentions: *droit du dommage corporel* and *droit de la santé*. Each local bar (*barreau*) also runs its own directory.

## 7. Clinical guidelines body

- **HAS** (Haute Autorité de Santé): https://www.has-sante.fr/ (verified). Searching has-sante.fr found **no HAS guideline specific to scaphoid fracture**.
- Closest French source: an **SFMU** (French emergency medicine society) congress paper, Urgences 2014:
  - "La fracture du scaphoïde suspectée mais avec une radio normale doit être explorée par un scanner ou une IRM";
  - "Le scanner et l'IRM … doivent être prescrits au moindre doute clinique avec radio normale".
  - https://sfmu.org/upload/70_formation/02_eformation/02_congres/Urgences/urgences2014/donnees/pdf/044.pdf (verified, 200).
- The **SFR imaging guide** (*Guide du bon usage des examens d'imagerie*, SFR/SFMN), https://gbu.radiologie.fr/: **not verified** (connection failed).
- HAS hospital quality ratings: QualiScope, https://www.has-sante.fr/jcms/c_1725555/fr/qualiscope-qualite-des-hopitaux-et-des-cliniques (200).

## 8. Free advice and advocacy

- **Santé Info Droits (France Assos Santé):** 01 53 62 40 30 (normal call rate). Mon/Wed/Fri 14h–18h; Tue/Thu 14h–20h.
  - **Online question form on the page, no login, no CAPTCHA seen** (Gravity Forms). Fields: email, civilité, département, age, question. Reply within 15 days.
  - https://www.france-assos-sante.org/sante-info-droits/ (verified).
- **User representatives (*représentants des usagers*)** on each hospital's CDU (named in the welcome booklet) can accompany the patient to the mediation meeting.
- **Point-justice / free legal consultations** at town halls and courthouses (justice.fr was in maintenance on the check date).
- National health/social line **31 33**, per ARS Île-de-France guidance (via search; not fetched).

## 9. Medical records access

- Source: [service-public F12210 "Dossier médical"](https://www.service-public.gouv.fr/particuliers/vosdroits/F12210) (verified); legal basis CSP L1111-7.
  - The request goes to the **director of the establishment**.
  - Records must be sent "Au plus tard dans les 8 jours suivant votre demande", and not before a **48-hour** reflection period. The deadline is **2 months** if the information is more than 5 years old.
  - Viewing on site is free.
  - Model letter: https://www.service-public.gouv.fr/particuliers/vosdroits/R24279 (verified).
  - The Défenseur des droits (RA-2026-022) reminded a public hospital that the **first copy must be free** (GDPR).
- **AP-HP:** you can request through **Mon AP-HP** (https://mon.aphp.fr/, verified; FranceConnect login) or by post with a downloadable form and ID. Leaflet: https://www.aphp.fr/sites/default/files/2025-05/D%C3%A9pliant_Comment%20obtenir%20votre%20dossier%20m%C3%A9dical_TD_digital.pdf (verified).
- **Mon espace santé** (national shared medical record): https://www.monespacesante.fr/ (verified). Login is **FranceConnect or a Mon espace santé account**. Hospital discharge and imaging reports may already be there.

## 10. Browser-agent notes

| Step | Public website, no login? | Mechanism | Login / ID | Bot wall | Notes |
|---|---|---|---|---|---|
| Identify hospital status (FINESS) | Yes | Search form | none | none seen | https://finess.esante.gouv.fr/ |
| Complaint to hospital | Usually **no web form**; letter or email to the director | Letter (agent drafts) | none | some hospital forms have reCAPTCHA (AP-HP contact form) | Agent can find the CDU/director address in the *livret d'accueil* |
| ARS complaint | **No**: Démat Social account needed | Multi-page web form (~28 min) | Démat Social account (email); FranceConnect not confirmed | curl got a **WAF "Request Rejected"**; WebFetch passed | Good fill task, but needs an account first |
| Défenseur des droits | **Yes**: multi-step form, no login on step 1 | Web form | none seen | none on step 1 | Only for public-service failings, not medical judgement |
| CCI claim | **Yes to download; no online filing** | **Fillable PDF (95 AcroForm fields)** + recorded-delivery post | none | none (direct PDF) | Agent can fill the PDF fields; the human prints, signs and posts |
| Find CCI address | Yes | JS dropdown; addresses are in inline JSON | none | none | Easy to parse |
| ONIAM question | Yes | Contact form | none | **reCAPTCHA** | Not needed for the claim |
| AP-HP indemnity claim | **No** | Web form | **FranceConnect+** (high-assurance) or an AP-HP *espace demandeur* account | **403 to curl** | Stop at login |
| Tribunal administratif | **No** | Télérecours citoyens | account / FranceConnect | — | A lawyer is mandatory for money claims anyway |
| Legal-aid eligibility | Yes (JS app) | Simulator | none indicated | JS-only | aidejuridictionnelle.justice.fr/simulateur |
| Legal-aid application | **No** | SIAJ online | **FranceConnect** | — | Not for the TA (paper cerfa 16146) |
| Find a lawyer | Yes on consultation.avocat.fr; **e-annuaire.avocat.fr resets the connection** | Search form with area-of-law dropdowns and a "spécialistes" checkbox | none | none seen on consultation.avocat.fr | Filter "responsabilité médicale et indemnisation" + city |
| Free advice | Yes | Santé Info Droits web form | none | none seen | Good no-login form to fill (stop before *Envoyer*) |
| Medical records | **No web form** for most hospitals; letter template | Letter (R24279 model) | Mon AP-HP / Mon espace santé need FranceConnect | — | Agent drafts the letter |

**Login systems:**
- **FranceConnect**: aide juridictionnelle, Mon espace santé, Mon AP-HP, optionally Télérecours.
- **FranceConnect+**: AP-HP indemnity claim. It needs a high-assurance identity (e.g. La Poste "L'Identité Numérique" or the France Identité app).
- **Démat Social account**: ARS complaint.
- **Agents must stop at every FranceConnect screen.**

**Language:** everything is in French. Form labels are French, and dates use DD/MM/YYYY.

**Hardest, most impressive browser task:** an end-to-end CCI claim.
1. Work out the competent CCI from the hospital's location on oniam.fr/trouver-ma-commission (JS dropdown).
2. Download the ONIAM PDF and **fill its 95 AcroForm fields**: victim identity, social-security body, the hospital as "acteur de santé mis en cause", act date, and a damage narrative.
3. Assemble the checklist of supporting documents from the *fiche pratique*.
4. Produce the recorded-delivery cover letter to that CCI's address.
5. Hand back to the human to sign and post.

The best **live web form** without login: the **Défenseur des droits** multi-step form, or the **Santé Info Droits** question form. Both are fill-only; stop before submit.

**Blockers:**
- FranceConnect / FranceConnect+ on all the official e-services (legal aid, AP-HP claim, Mon espace santé, Télérecours).
- No online filing at the CCI at all (post only).
- reCAPTCHA on the ONIAM contact form and the AP-HP contact form.
- A WAF blocks scripted clients on demat.social.gouv.fr, e-annuaire.avocat.fr and reclamation-indemnitaire.aphp.fr. A real browser may pass where curl fails.
- Légifrance returns 403 to curl.
- justice.fr was in maintenance on the check date.

## Sources

- service-public, CCI and medical accidents: https://www.service-public.gouv.fr/particuliers/vosdroits/F13318 (verified)
- service-public, CCI form page: https://www.service-public.gouv.fr/particuliers/vosdroits/R1459 (verified)
- ONIAM CCI form PDF: https://www.oniam.fr/medias/uploads/formulaire%20CCI%202021/Formulaire_%20CCI.pdf (verified)
- ONIAM fiche pratique: https://www.oniam.fr/medias/uploads/FICHES%20PRATIQUES%20MONTREUIL/FICHES/Fiche%20pratique%20AM%20au%2030.03.2021.pdf (verified)
- ONIAM pages:
  - https://www.oniam.fr/accidents-medicaux (verified)
  - https://www.oniam.fr/procedure-indemnisation (verified)
  - https://www.oniam.fr/procedure-indemnisation/demande-conciliation (verified)
  - https://www.oniam.fr/trouver-ma-commission (verified)
  - https://www.oniam.fr/contact (verified)
- service-public, Commission des usagers: https://www.service-public.gouv.fr/particuliers/vosdroits/F10256 (verified)
- sante.fr, ways to complain: https://www.sante.fr/quelles-voies-de-recours-pour-porter-une-reclamation-sur-un-soin-ou-une-prise-en-charge (verified)
- sante.fr, complaints to the professional orders: https://www.sante.fr/node/135929 (verified)
- CNOM L4124-2 leaflet for complainants: https://www.conseil-national.medecin.fr/sites/default/files/external-package/fiche_pratique/ti6ybn/fiche_info_plaignant_l.4124-2.pdf (**broken, 404**)
- ARS Île-de-France, how to complain: https://www.iledefrance.ars.sante.fr/comment-deposer-une-reclamation (verified)
- ARS complaint form: https://demat.social.gouv.fr/commencer/sante-social-signaler (verified via WebFetch; WAF blocks curl)
- Défenseur des droits form: https://formulaire.defenseurdesdroits.fr/formulaire_saisine/?ETAPE=accueil_2016 (verified)
- Défenseur des droits decision 2025-217: https://juridique.defenseurdesdroits.fr/doc_num.php?explnum_id=23016 (verified)
- Adverse-event portal: https://signalement.social-sante.gouv.fr/ (verified)
- service-public, administrative court claims: https://www.service-public.gouv.fr/particuliers/vosdroits/F2640 (verified)
- Télérecours citoyens: https://citoyens.telerecours.fr/ (verified 200)
- AP-HP online services: https://www.aphp.fr/mes-demarches-en-ligne (verified)
- AP-HP indemnity claim: https://reclamation-indemnitaire.aphp.fr/ (**not verified, 403**)
- AP-HP contact form: https://www.aphp.fr/form/contact (verified, reCAPTCHA)
- service-public, legal aid: https://www.service-public.gouv.fr/particuliers/vosdroits/F18074 (verified)
- service-public, online legal aid: https://www.service-public.gouv.fr/particuliers/vosdroits/R66463 (verified)
- service-public, legal aid form: https://www.service-public.gouv.fr/particuliers/vosdroits/R1444 (verified)
- Legal-aid simulator: https://www.aidejuridictionnelle.justice.fr/simulateur (200, JS-only)
- Legal-aid login: https://www.aidejuridictionnelle.justice.fr/authentification (verified)
- CNB on SIAJ online legal aid (31 Oct 2025): https://cnb.avocat.fr/actualite/siaj-les-justiciables-peuvent-deposer-et-suivre-leur-demande-d-aide-juridictionnelle-en-ligne (verified via WebFetch)
- CNB directory: https://www.cnb.avocat.fr/fr/annuaire-des-avocats-de-france (verified)
- CNB e-annuaire: https://e-annuaire.avocat.fr/ (**not verified, connection reset**)
- consultation.avocat.fr: https://consultation.avocat.fr/ (verified)
- consultation.avocat.fr, by specialism: https://consultation.avocat.fr/avocats/par-specialisation.php (verified)
- HAS: https://www.has-sante.fr/ (verified)
- SFMU 2014 congress paper: https://sfmu.org/upload/70_formation/02_eformation/02_congres/Urgences/urgences2014/donnees/pdf/044.pdf (verified)
- SFR imaging guide: https://gbu.radiologie.fr/ (**not verified**)
- Santé Info Droits: https://www.france-assos-sante.org/sante-info-droits/ (verified)
- service-public, medical record: https://www.service-public.gouv.fr/particuliers/vosdroits/F12210 (verified)
- service-public, medical record model letter: https://www.service-public.gouv.fr/particuliers/vosdroits/R24279 (verified)
- Mon espace santé: https://www.monespacesante.fr/ (verified)
- Mon AP-HP: https://mon.aphp.fr/ (verified)
- FINESS register: https://finess.esante.gouv.fr/ (verified)
- Légifrance (CSP L1142-1, L1142-7, L1142-28, L1111-7, L4124-2, R1112-79 to R1112-94; CJA R431-2): https://www.legifrance.gouv.fr/ (403 to curl; WebFetch works)
