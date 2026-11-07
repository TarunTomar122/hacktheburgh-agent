# Sweden (researched 2026-11-07)

Scope: a patient harmed by care at a **public** hospital (here: a regional emergency department, e.g. Karolinska Universitetssjukhuset in Region Stockholm, missed a scaphoid / båtben fracture; the patient now needs surgery) who wants (a) answers and an apology and (b) possibly compensation.
Every fact has an official source link. URL status checked with `curl -sL` on 2026-11-07: **verified** (fetched, HTTP 200) / **not verified** / **broken**.

**Route in one line:** complaint to the hospital (vårdgivaren) via 1177 or post, or via the regional **Patientnämnd** -> (only if serious and lasting harm) **IVO** complaint -> compensation is a separate, free, no-fault-style claim to **Löf** (patient insurance for all region-funded care), with free review by **Patientskadenämnden**, or court as an alternative.

Key point for the agent: in Sweden **complaint** (answers, apology, learning) and **compensation** are fully separate tracks. Löf says it does not handle complaints; the Patientnämnd and IVO do not handle money. "IVO utreder inte frågor om ekonomisk kompensation."

## 1. Which body runs the hospital, and how a patient finds out

- Public hospitals are run by the 21 **regions** (regioner). In Stockholm, Region Stockholm runs Karolinska Universitetssjukhuset; the regional patient committee and complaints pages sit under regionstockholm.se.
- The patient finds the responsible clinic and region via **1177** (the national health portal, with regional sub-sites such as `/Stockholm/`). Region-funded care is insured by **Löf**: "Den som vårdats inom regionfinansierad vård kan göra en skadeanmälan till Löf." (lof.se/anmal-en-skada)
- Private providers are not covered by Löf: "Privat vårdpersonal som är legitimerad har en försäkring hos privata försäkringsbolag" and staff "är skyldig att berätta vilket försäkringsbolag de har." (1177 Stockholm, ersättning vid patientskada)
- Providers must tell an injured patient about complaints, Patientnämnd, IVO and the right to compensation under patientskadelagen (Patientsäkerhetslagen 2010:659, 3 kap. 8 §).

## 2. Complaint to the provider

- **Legal duty (since 1 Jan 2018, Lag 2017:378):** "Vårdgivaren ska från patienter och deras närstående ta emot klagomål" (PSL 3 kap. 8 a §) and "ska snarast besvara klagomål ... Vårdgivaren ska ge klaganden 1. en förklaring till vad som har inträffat, och 2. i förekommande fall, en beskrivning av vilka åtgärder som vårdgivaren avser att vidta för att en liknande händelse inte ska inträffa igen." (3 kap. 8 b §). No statutory apology duty.
- **Response time:** "Vanligtvis ska du ha fått ditt svar inom fyra veckor." (1177 Stockholm); Region Stockholm says "fyra-fem veckor".
- **How (Karolinska example):** online through 1177 e-services (login required) or by letter. Karolinska: patient matters are not handled by e-mail; a complaint by a representative needs a fullmakt and must go by post to "Karolinska Universitetssjukhuset, Enheten för Registratur och informationshantering, Eugeniavägen 18 C, plan 4, 171 76 Solna". Anonymous comments are possible but get no reply.
- **Login:** the 1177 route needs Swedish e-legitimation (BankID, Freja+; 1177 login page also lists "Foreign eID"/eIDAS).
- No time limit on complaining to the provider found.

URLs:
- https://www.karolinska.se/vard/patient-och-besokare/synpunkter_och_klagomal/ (verified)
- https://www.1177.se/Stockholm/sa-fungerar-varden/om-du-inte-ar-nojd/om-du-inte-ar-nojd-med-varden/ (verified; 1177.se later returned HTTP 429 to repeated requests)
- https://e-tjanster.1177.se/mvk/login/login.xhtml (verified; login page, offers BankID / Freja / Foreign eID)

## 3. Escalation: Patientnämnd and IVO

### 3a. Patientnämnden (regional patient committee) — free, independent, support role
- Region Stockholm: "Patientnämnden fungerar som en länk mellan dig och vårdgivaren och ser till att du får svar på dina klagomål eller synpunkter." It does not judge medical fault or compensation. You do **not** need to contact the clinic first (1177 Stockholm).
- **How to file (Stockholm):** (1) "Logga in på 1177.se med din e-legitimation. Välj 'Regionen rekommenderar' Sedan 'Lämna synpunkter och klagomål hos Patientnämnden'"; (2) a blankett you can "fylla i digitalt eller för hand. Oavsett så måste du skriva ut den och skicka den med vanlig post"; (3) phone 08-123 467 00 (Mon-Thu 9.00-11.30, anonymous possible); (4) post: Patientnämndens förvaltning, Box 30198, 104 25 Stockholm; (5) e-mail registrator.pan@regionstockholm.se (not for confidential information).
- To let the committee contact the provider "behöver du lämna din ansökan digitalt via 1177.se eller skicka in en underskriven ansökan per post."
- Handläggare contacts you "inom 15 arbetsdagar"; answer from the provider "vanligtvis lite över en månad".
- English complaint form and power-of-attorney form exist.

URLs:
- https://www.regionstockholm.se/halsa-sjukvard/patientnamnden/ (verified)
- https://www.regionstockholm.se/halsa-sjukvard/patientnamnden/lamna-synpunkter-och-klagomal-pa-varden/ (verified)
- https://www.regionstockholm.se/dokument/halsa-och-vard/blankett/blankett-synpunkter-eller-klagomal/ (verified; Swedish blankett page)
- https://www.regionstockholm.se/4903fe/siteassets/halso--och-sjukvard/pan/complaint-form-english.pdf (verified, PDF)
- https://www.regionstockholm.se/49e1a6/siteassets/halso--och-sjukvard/pan/power-of-attorney-english.pdf (not verified individually; linked from verified page)
- https://www.1177.se/Stockholm/lankbiblioteket/stockholm/lankar-till-olika-e-tjanster/patientnamnden---anmalan/ (verified; redirects straight to the Inera login IdP `idp.invanar-idp.inera.se`)
- https://www.regionstockholm.se/48ff36/siteassets/halso--och-sjukvard/pan/synpunkter-eller-klagomal-2024_1-fyll-i-digitalt.pdf (**broken**, 404; older form URL still in search results)

### 3b. IVO (Inspektionen för vård och omsorg) — the national regulator
- **2018 rule (Lag 2017:378):** IVO investigates only after the provider has had a chance to answer, and only certain cases. PSL 7 kap. 11 §: IVO "ska, om berörd vårdgivare har fått möjlighet att fullgöra sina skyldigheter enligt 3 kap. 8 b §, utreda klagomål som rör 1. kroppslig eller psykisk skada eller sjukdom som uppkommit i samband med hälso- och sjukvård och som är bestående och inte ringa eller har lett till att patienten fått ett väsentligt ökat vårdbehov eller avlidit" (plus coercive care and integrity cases). "Inspektionen för vård och omsorg får avstå från att utreda klagomål om händelsen ligger mer än två år tillbaka i tiden." 7 kap. 12 §: if the provider has not had the chance to answer, IVO may forward the complaint to the provider or Patientnämnden.
- Our case: a missed scaphoid fracture leading to surgery may meet "väsentligt ökat vårdbehov"/lasting harm, but IVO decides.
- IVO page: "För att lämna ett klagomål till IVO ska du först ha framfört ditt klagomål till ansvarig vårdgivare." Decision whether to investigate "inom cirka en månad"; if investigated "handläggningstiden just nu cirka 23 månader". "Alla uppgifter i anmälan kan lämnas ut" (low secrecy, public documents).
- **How:** "Använd gärna i första hand IVO:s e-tjänst" (button "E-tjänst Logga in" -> minasidor.ivo.se, a Blazor app behind login; which e-IDs it accepts was **not verified**, presumably BankID/Freja). Second hand: blankett (PDF, version 2026) sent to registrator@ivo.se or Inspektionen för vård och omsorg, Box 45184, 104 30 Stockholm. "Du behöver inte skicka med några bilagor." Phone 010-788 50 00 (09.00-12.00 weekdays).
- PSL 7 kap. 14 §: complaint should state the provider/staff, the event, the time, and the complainant's name and address.

URLs:
- https://www.ivo.se/beratta-for-ivo/klagomal-halso-sjukvard/ (verified)
- https://minasidor.ivo.se/ (verified loads; login-gated SPA)
- https://www.ivo.se/globalassets/dokument/publikationer/blanketter/klagomal/33-anmalan-om-klagomal-pa-halso--och-sjukvard-eller-tandvard-2026-10-13.pdf (verified, PDF; note the filename carries a date and changes with each version)
- https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/patientsakerhetslag-2010659_sfs-2010-659/ (verified; PSL text)

## 4. Compensation route

### 4a. Löf patient insurance (main route; free; no fault needed against an individual)
- Law: Patientskadelag (1996:799). § 6: compensation if "övervägande sannolikhet" the injury was caused by e.g. "3. felaktig diagnostisering" (judged against "en erfaren specialist"). Avoidability is required: Löf's form says "Skadan måste ha varit undvikbar för att ersättning ska kunna lämnas." A missed scaphoid fracture is a textbook "felaktig diagnostisering" claim.
- **Time limit (correction to the brief: the old 3-year rule no longer applies to new injuries):** § 23: "Den som vill ha ersättning enligt denna lag måste väcka talan inom tio år från den tidpunkt då skadan orsakades." (in force for injuries from 1 Jan 2015, Lag 2013:1091). 1177: "Du måste anmäla skadan inom tio år från att du fick din skada"; for injuries up to 31 Dec 2014 older rules apply, including three years from when you learned you could claim. If reported in time, at least six months to sue after Löf's final position. § 24: late claims only for "synnerliga skäl".
- **Amounts:** § 9 deducts 1/20 of the prisbasbelopp; § 10 caps at 200 prisbasbelopp per patient per event. Löf: "Vi har sedan 2018 valt att helt ta bort den tidigare självrisken för dig som kund."
- **How to claim (lof.se/anmal-en-skada/egen-skada):**
  - Digital: https://anmalan.lof.se/ — "Du behöver BankID för att göra en digital anmälan."
  - **Without BankID: a public web form, no login**, at https://anmalan.lof.se/Claim/GetStarted -> "Gör en anmälan via post" (`/Claim/OpenClaim?isDigitalClaimChosen=false`). Löf: "Fyll i en skadeanmälan här", then print, sign, and post to "Löfs inläsningscentral, Box 334, 151 24 Södertälje".
  - Rules shown on the form: "Du kan enbart anmäla skador som gäller dig personligen och en skada per anmälan." "Löf behöver en komplett lista över de vårdgivare som du besökt innan och efter din skada." "Du behöver slutföra din anmälan inom 60 minuter. Därefter förlorar du uppgifterna du fyllt i."
  - Step 1 "Personuppgifter" fields (checked in HTML): Firstname, Lastname, Ssn ("Personnummer (ååååmmddnnnn)"), Street, PostNo, City, PhoneNo, PhoneNoSecondary, Email, ConfirmEmail (paste blocked by JS). Anti-forgery token, no CAPTCHA found. Later steps are not visible without filling step 1.
  - Representatives, guardians and estates: post only ("En skadeanmälan som gäller någon annan än dig själv kan inte göras digitalt").
  - "Observera att skadeanmälningar inte kan skickas via e-post eller telefon." "Du behöver inte skicka in några journaler själv" (Löf collects records).
  - Before claiming you must have sought care, the problem must be documented, and you must list the providers.
- Handling: simple cases "oftast ... ett beslut inom en månad", complex ones "flera års tid". Internal review (omprövning) by a different handler is always available.

### 4b. Patientskadenämnden (free review of Löf's decision)
- Advisory board that Löf always follows ("vars beslut vi alltid följer"). "Det kostar dig ingenting och nämnden ändrar aldrig försäkringsbolagets beslut till nackdel för dig." You ask **via Löf** (handläggare or Mina sidor), not directly on the board's site.
- Deadline: § 17 a: "senast ett år från det att han eller hon fick del av försäkringsgivarens slutliga ställningstagande".

### 4c. Court
- § 18: the patient "får ... i stället kräva skadestånd" under general tort law (skadeståndslagen) in the allmän domstol. Löf: you "kan behöva betala rättegångskostnaderna, om du förlorar fallet." No pre-action protocol found.

URLs:
- https://lof.se/ (verified)
- https://lof.se/anmal-en-skada (verified via fetch)
- https://lof.se/anmal-en-skada/egen-skada (verified via fetch)
- https://anmalan.lof.se/ (verified; redirects to /Claim/GetStarted)
- https://anmalan.lof.se/Claim/GetStarted (verified; public, no login)
- https://minasidor.lof.se/ (verified; redirects to login at ticket.siriusit.net)
- https://lof.se/frageguiden (verified; JS question guide, ~5 min, "Du kan alltid skicka in en anmälan, oavsett vad guiden visar")
- https://lof.se/patient/faq (verified)
- https://www.patientskadenamnden.se/ (verified)
- https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/patientskadelag-1996799_sfs-1996-799/ (verified)
- https://www.1177.se/Stockholm/sa-fungerar-varden/kostnader-och-ersattningar/ersattning-vid-patientskada/ (verified)
- https://www.1177.se/Stockholm/lankbiblioteket/nationella-lankar/l/lof-patientforsakring/lof-patientforsakring---skadeanmalan/ (**broken**: redirects to lof.se/blanketter, 404)
- https://lof.se/patient, https://lof.se/filer/skadeanmalan_omyndig_ifyllbar.pdf (**broken**, 404; old Löf URLs still in search results)

## 5. Funding

- The Löf route and Patientskadenämnden cost the patient nothing; no lawyer is needed.
- **Rättshjälp (state legal aid):** "Om du har rättsskydd i någon av dina försäkringar kan du inte få rättshjälp" (rättsskydd usually in hemförsäkring). Income limit: above "260 000 kronor per år" no legal aid. Usually needs advice from a lawyer "i minst en timme" first (fixed fee). The lawyer submits the application (form DV 1030; e-service with BankID signing for both parties) to Rättshjälpsmyndigheten.
- **No win no fee:** contingency fees for Swedish advokater are generally not allowed except for "särskilda skäl" under the Bar's ethical rules (secondary source only, **not verified** against the rule text).

URLs:
- https://www.domstol.se/amnen/rattshjalp/ (verified)
- https://www.domstol.se/amnen/rattshjalp/behover-du-rattshjalp/har-du-ratt-till-rattshjalp/ (verified)
- https://www.domstol.se/amnen/rattshjalp/behover-du-rattshjalp/ansok-om-rattshjalp/ (verified)
- https://www.domstol.se/globalassets/filer/gemensamt-innehall/blanketter/rattshjalp/ansokan-om-rattshjalp-dv-1030.pdf (verified, PDF)
- https://www.domstol.se/amnen/rattshjalp/behover-du-rattshjalp/rakna-ut-ditt-ekonomiska-underlag/ (not verified; step-by-step guide rather than a calculator)

## 6. Finding a lawyer

- **Sveriges Advokatsamfund "Sök advokat"**: public search, no login. Fields: Ort (dropdown), Juridisk inriktning (JS picker with 13 categories; relevant: "Personskaderätt", "Skadeståndsrätt", "Sjukvårds- och patienträtt"), first/last name, Byrå, Titel, Land, Språk (e.g. Engelska). No CAPTCHA seen. Only the title "advokat" is protected; there is no medical-negligence accreditation panel.
- EU fallback: e-Justice "Find a lawyer".

URLs:
- https://www.advokatsamfundet.se/Sok-advokat/ (verified)
- https://e-justice.europa.eu/topics/find-legal-professional/lawyers_sv (not verified)

## 7. Clinical guidelines body

- No national Socialstyrelsen guideline for scaphoid fracture found. Socialstyrelsen's nationella riktlinjer cover large disease areas, not wrist fractures. Guidance is regional or professional.
- **1177 (patient-facing, Region Stockholm):** "Ibland syns det inte på den första röntgenundersökningen att du brutit båtbenet." If still suspected, the wrist is put in a cast and "Du får då komma tillbaka efter ungefär två veckor för att gå på en magnetkameraundersökning eller en vanlig röntgen." "Ett båtbensbrott syns bättre på en undersökning med magnetkamera."
- **Läkartidningen 2019;116:FLMY (J. Andersson, review):** it "ska misstänkas vara en skafoideumfraktur tills motsatsen är bevisad"; "bilder över skafoideum normalt inte ingår i röntgenundersökning av handleden"; negative X-ray -> "gipsskena", re-X-ray and re-examination "efter en dryg vecka", then "MRT av skafoideum att utföras inom en vecka". Sensitivity of first X-ray about 70%.
- Regional example: Region Kronoberg "Handläggning scafoideumfraktur" (PDF).

URLs:
- https://www.1177.se/Stockholm/olyckor--skador/skador-pa-hander-och-fotter/batbensbrott/ (verified)
- https://lakartidningen.se/vetenskap/skafoideumfrakturer-viktigt-med-korrekt-diagnos-i-tid/ (verified)
- https://www.regionkronoberg.se/contentassets/c2bc2b5344ec4bb097c2a721aa31b061/karin-arnstrom---handlaggning-scafoideumfraktur-ll.pdf (verified)
- https://www.socialstyrelsen.se/kunskapsstod-och-regler/regler-och-riktlinjer/nationella-riktlinjer/ (verified)
- https://www.viss.nu/ (verified loads; site search found no scaphoid page)

## 8. Free advice and advocacy

- **Patientnämnden** (every region; free, independent; helps write the complaint). Stockholm 08-123 467 00.
- **Löf Kundcenter** 08-551 010 00, weekdays 09.00-15.00, info@lof.se (questions only, no claims by e-mail).
- **IVO upplysningstjänst** 010-788 50 00.
- **Patientskadenämnden** (questions about review), https://www.patientskadenamnden.se/om-oss/kontakt/ (not verified).
- 1177 phone advice is for medical questions, not complaints.

## 9. Medical records access

- Online: **Journalen on 1177** (login with BankID or Freja+; age limits vary by region, e.g. 16 in Skåne; which notes are shown varies by region and clinic). Secondary source: 1177 regional login FAQ pages (not fetched, 1177 returned HTTP 429).
- Otherwise ask the clinic or hospital for a copy of the record (patientdatalagen / offentlighets- och sekretesslagen; legal text **not verified** here).
- For the Löf claim the patient does not need records: "Du behöver inte skicka in några journaler själv."

## 10. Browser-agent notes

| Step | Public site, no login? | Channel | Login / ID | Bot wall | Language |
|---|---|---|---|---|---|
| Find region and hospital (1177, regionstockholm.se) | Yes | Info pages | None | **1177.se returned HTTP 429 after a few curl requests** | Swedish (some English) |
| Complaint to hospital | No online form without login | 1177 e-service or letter | BankID / Freja+ / Foreign eID (Inera IdP) | Login wall | Swedish |
| Patientnämnd (Stockholm) | Partly: blankett page and PDF are public; online route needs login | 1177 e-service (login), fillable PDF printed and posted, phone, e-mail | 1177 e-legitimation for the online route | None on PDF | Swedish; English PDF form exists |
| IVO complaint | No | E-service (login) or PDF to registrator@ivo.se / post | e-legitimation (which IDs not verified) | Login wall | Swedish |
| **Löf claim, postal variant** | **Yes: multi-step HTML web form, no login** | Fill online -> print -> sign -> post | **None** (the BankID variant is the "digital" one) | No CAPTCHA seen; anti-forgery token; **60-minute session limit**; paste blocked in "Bekräfta e-postadress" | Swedish only |
| Löf claim, digital | No | anmalan.lof.se | BankID only | Login wall | Swedish |
| Patientskadenämnden review | No direct form | Request via Löf (Mina sidor or handläggare) | Löf Mina sidor login | — | Swedish |
| Lawyer search (Advokatsamfundet) | Yes | Search form with JS specialty picker | None | None seen | Swedish UI |
| Legal aid | No (lawyer files) | DV 1030 PDF / e-service with BankID signing | BankID | — | Swedish / English PDF |
| Records (Journalen) | No | 1177 | BankID / Freja+ | Login wall | Swedish |

**Hardest, most impressive browser task:** the **Löf skadeanmälan via the postal route** at https://anmalan.lof.se/Claim/GetStarted -> "Gör en anmälan via post". It is a real, multi-step, Swedish-only ASP.NET form with no login: personal details (Personnummer must be 12 digits, ååååmmddnnnn, probably checksum-validated, so a demo persona needs a valid-format test personnummer), then the injury, the providers seen before and after (Löf wants a "komplett lista"), and the timeline, all within a **60-minute** session, with a confirm-email field that blocks paste (the agent must type it). It ends in a printable claim to sign and post. **Stop before the final step that generates the finished claim**; never post. It maps directly onto patientskadelagen § 6 p. 3 "felaktig diagnostisering".
Runner-up: fill the Region Stockholm Patientnämnd fillable PDF (or English PDF) and the IVO PDF form offline. The online routes for both are BankID-gated.

**Blockers:** Swedish e-legitimation (BankID / Freja+) gates every "digital" route: 1177 complaints, Patientnämnd online, IVO e-tjänst, Löf digital claim and Mina sidor, Journalen. 1177.se rate-limits (HTTP 429). All forms are Swedish. Old URLs in search results 404 (Löf /filer/..., the Stockholm PDF, the 1177 -> Löf link), so the agent must navigate from the home pages rather than trust search hits. The IVO form PDF filename contains a version date and will change.

## Sources
- Löf: https://lof.se/ , https://lof.se/anmal-en-skada , https://lof.se/anmal-en-skada/egen-skada , https://anmalan.lof.se/Claim/GetStarted , https://lof.se/patient/faq (all verified)
- Patientskadelag (1996:799): https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/patientskadelag-1996799_sfs-1996-799/ (verified)
- Patientsäkerhetslag (2010:659): https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/patientsakerhetslag-2010659_sfs-2010-659/ (verified)
- IVO: https://www.ivo.se/beratta-for-ivo/klagomal-halso-sjukvard/ (verified)
- Region Stockholm Patientnämnden: https://www.regionstockholm.se/halsa-sjukvard/patientnamnden/lamna-synpunkter-och-klagomal-pa-varden/ (verified)
- 1177 Stockholm: https://www.1177.se/Stockholm/sa-fungerar-varden/om-du-inte-ar-nojd/om-du-inte-ar-nojd-med-varden/ , https://www.1177.se/Stockholm/sa-fungerar-varden/kostnader-och-ersattningar/ersattning-vid-patientskada/ , https://www.1177.se/Stockholm/olyckor--skador/skador-pa-hander-och-fotter/batbensbrott/ (verified)
- Karolinska: https://www.karolinska.se/vard/patient-och-besokare/synpunkter_och_klagomal/ (verified)
- Patientskadenämnden: https://www.patientskadenamnden.se/ (verified)
- Sveriges Domstolar, rättshjälp: https://www.domstol.se/amnen/rattshjalp/ (verified)
- Advokatsamfundet: https://www.advokatsamfundet.se/Sok-advokat/ (verified)
- Läkartidningen 2019;116:FLMY: https://lakartidningen.se/vetenskap/skafoideumfrakturer-viktigt-med-korrekt-diagnos-i-tid/ (verified)
