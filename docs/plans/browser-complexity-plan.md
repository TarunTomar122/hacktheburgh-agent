# Plan: extra browser work (proposed, not decided)

**Status:** `proposed` by Lea + Claude, 2026-11-07. Nothing here is built or decided. Taking any item on needs a claim in `docs/ACTIVE_WORK.md` and, where it says so, a decision in `docs/DECISIONS.md`.
**Based on:** `main` at `1ccd909`. Site facts are **verified** only where the line says so (in-app browser, 2026-11-07, searches and page reads only, **nothing submitted**). Everything else is **unverified**. Legal points are **unverified**.

**Scope:** only work where the agent *acts* in the browser: filling forms, choosing between forms, following one person or document across sites, recovering when something does not match. Searching and reading on their own do not count. They appear only as the first link of a chain that ends in an action.

**Privacy:** the repo is public. Real solicitors are not named here. Examples are reduced to the first-name pattern and the firm.

---

## X2. Follow the specialist, not the firm (recommended)

### The idea
Pick an accredited medical negligence specialist from the Law Society register, find that person on their firm's own site, and contact them through the best available form, falling back step by step. The register data (name, firm, office, email) decides what happens on the firm's site.

### The chain
1. **Register (Law Society, "Find an individual").** Fill postcode and the specialism filter, press Search, open "View details" for each result. Output: name, firm, office, email, website.
2. **Firm's own site.** Find the person through "Our people", team pages, the site's own filters (service, office), "load more" or the site search.
3. **Match the name.** The model chooses; code checks the surname and the firm.
4. **Branch on mismatch:**
   - not on the firm's site -> search the register by name -> if listed at a new firm, start again at 2 for that firm
   - wrong office -> the next specialist
   - profile shows defender-only work -> drop them
5. **Choose the contact route, best first:**
   1. a contact form on the person's own profile
   2. the firm's specialised clinical negligence form
   3. the firm's general form, addressed to the person (team or office picked where the form offers it)
   4. the next specialist at another firm (reuses D46 `reserves`)
6. **Fill in parallel tabs and stop before Send** (as step 4 does). Each fallback is logged as a recovery the judges can see.

### Verified: Law Society register (2026-11-07)
- **"Find an individual" tab** (`?type=sol`).
  - Fields: `LastName`, `FirstName`, `IndividualName` (firm), `IndividualPostcode`, `AreaOfWork`.
  - Advanced: `SolicitorAdvocate` and **`Specialism`** (36 options).
- **Specialism values:** `Medicalneg` (Medical Negligence Law Specialisation) and `Medicalnegdo` (**Medical Negligence (Defender Only)**).
- **Edinburgh + `Medicalneg`:** 9 solicitors at 5 firms (Balfour + Manson, Drummond Miller, Irwin Mitchell Scotland, Anderson Strathern, Digby Brown). The first four are already in `ENQ` in `scripts/bench.ts`.
- **Edinburgh + `Medicalnegdo`:** no results.
- **"View details"** expands in place and shows address, phone, email, website and areas of law.
- **Quirk:** opening the results URL directly showed nothing. Filling the form and pressing Search worked. Search reloads the page.

### Verified: firm sites (2026-11-07)

| Firm | Finding the person | Register vs site name | Contact routes |
|---|---|---|---|
| **Anderson Strathern** | Medical negligence page lists the team with "View Profile" | "Robert …" -> **"Robbie …"** | **Per-person form on the profile ("Contact <first name>")**, same fields as the general form (email*, phone*, "How can we help?"*, Yes/No radio, legal-aid and terms checkboxes, "how did you hear" dropdown). HubSpot. **Whether it is routed to that person is unknown.** Also a `mailto:` link. Invisible reCAPTCHA. |
| **Drummond Miller** | "Our People" with **filters**: name box, All staff / Partners radios, area-of-law and office checkboxes (`?aol=medical-negligence`, 20 people) | "Caroline …" -> **"Carrie …"**; two others match | No per-person form (the profile shows a phone number only). **Specialised clinical negligence intake form**, see below. The cookie banner hides the main content until declined. |
| **Balfour + Manson** | Medical negligence page links each person's profile (`/our-people/<name>/`) | Matches; one person is "Consultant" on the team list but **"Partner"** on the profile | No per-person form. The profile shows email, phone and office. **General form at `/contact-us/`**: name, phone, email, "how did you hear" dropdown, "Nature of Enquiry", "Where are you located?" (free text), consent checkbox. No team dropdown. Invisible reCAPTCHA v3. (See Discrepancy 10 in `PROGRESS.md`.) |
| **Irwin Mitchell** | "Our People" search with **suggestions while typing**, "Filter by Expertise" and "Filter by Location" boxes, "Show more experts". A guessed profile URL gave **404** | **Neither register specialist was found** (`?search=` showed the default list) | Site-wide form: First*, Last*, Email*, Phone*, **"Enquiry Type"*** (custom picker), Description. A **live chat widget**. A Cookiebot modal blocks the page until "Reject All". |

### The heaviest form found: Drummond Miller clinical negligence intake
`https://www.drummondmiller.co.uk/contact-us/medical-clinical-negligence/` (verified 2026-11-07, nothing submitted), about 38 fields:
- Contact details (address*, city*, postcode*), preferred contact (Telephone / Email / Post radios), best time to call.
- **"Who is the enquiry regarding?"** with a someone-else section: name, relationship, permission checkbox, date of birth, **date of death**.
- **Three Yes/No questions:** other solicitors acting or previously instructed; **written complaint made**; **investigation by the GP practice, Health Board, Care Inspectorate or SPSO**.
- **8 narrative questions:**
  - who and what the criticism is about
  - the dates
  - when you first suspected
  - how the care should have differed
  - the difference to the outcome
  - medical confirmation
  - ongoing treatment
  - impact (physical, mental, financial)
- A `__next` button suggests several pages (**unverified**). Invisible reCAPTCHA.

**Why it matters:**
- **Our earlier steps answer its questions:** "written complaint made?" = step 1 status, and "investigation by Health Board or SPSO?" = step 2 status. That is data from our own workflow going into a third-party form.
- The someone-else section is a **second persona branch** (backlog item 4).
- **The narrative answers cannot be invented** (D21). The agent fills what the profile and the approved draft cover and **asks the user for the rest**. "How should the care have been different?" is the user's own view, never ours.

### What the probe showed
- **Name matching is a real problem:** 2 of 4 firms use a nickname, and one firm shows a different role on two pages. Matching needs first-name variants plus firm and office.
- **The "not found" branch happens** (Irwin Mitchell), so the fallback is needed from the start.
- **Per-person forms:** 1 of 4 firms. **Profiles with a direct email:** 2 of 4.
- **Obstacles seen:**
  - three different cookie banners that block the page
  - invisible reCAPTCHA on every form
  - a live chat widget
  - suggestion lists while typing
  - filter checkboxes
  - a guessed URL that returns 404

### Shortcomings and unknowns
- **Register search and name matching alone are lookups.** The register form submits by GET. X2 only counts as browser work if it ends in steps 5-6.
- **Unverified:**
  - whether Anderson Strathern's per-person form reaches that person
  - whether Drummond Miller's intake form is several pages
  - whether Irwin Mitchell's search fails only for an automated browser (not checked by hand)
- Two people with the same surname at one firm would fool a surname check. Code must also confirm the firm and office.
- **Never contacts a real firm.** The D45 send gate (`ALLOW_REAL_SEND`, no example.com) stays.

### Files (proposed)
- A new `lib/agent/specialist.ts`: register search and name matching.
- `lib/agent/enquiry.ts`: route choice and fallbacks.
- `lib/agent/enquiryTypes.ts`: the specialist's name and the route chosen.
- A bench task for the Drummond Miller intake form, and one per firm site (D22).

Step 3 and step 4 have owners in `ACTIVE_WORK.md`: ask them first.

---

## X1. Act on replies in an inbox (demo only)

### The idea
Seed an inbox with fictional emails. The agent opens it **in the browser**, searches it, opens threads and acts on what it reads:
- **NHS acknowledgement** -> copy the complaint reference into the SPSO form and unlock step 2.
- **NHS final response with a PDF** -> download it -> upload it to the SPSO upload page.
- **Specialist asks for an intake form** -> follow the link -> fill a second, longer form (a local test page, never a real firm) -> stop before Send.
- **"Passed to my colleague X"** -> check X on the register (X2 step 1) -> update the case.
- **"We cannot take this on"** -> mark the firm and contact the next specialist from X2.
- **Sender check:** if the sender's address does not match the email the register lists, flag it and do not follow its links.

### Why it is browser work
Searching an inbox, opening threads, downloading an attachment, uploading it elsewhere, following a link to a second form, and branching on each email's content. Together with X2 it forms a loop: register -> firm site -> form -> inbox -> register -> next firm or intake form.

### Shortcomings (why it is demo only)
- **Not feasible for real users.**
  - Their email is behind their own webmail login, which we do not automate (D4).
  - D13 sends real email through a managed connector, which is an API, not browser work.
- **The demo inbox would be Mailpit**, a local mail catcher with a web inbox. It is a test tool, not something a customer would run.
  - Download it only from the official GitHub releases (`axllent/mailpit`), into its own empty folder.
  - Run it as a normal user with `--listen 127.0.0.1:8025 --smtp 127.0.0.1:1025`, so only this machine can reach it, and deny the firewall prompt.
  - No `--database` (by its docs, **unverified**, mail is then deleted on exit) and no relay.
  - Fictional emails only.
  - It still runs with the user's normal permissions, like any program.
- **Uploads need engine work.** `observe.ts` treats `input[type=file]` as a text box today. D30 ruled out SPSO uploads, so this needs a superseding decision and a fictional sample PDF.
- **It needs a decision** replacing D13 for the demo only.

### Rejected alternatives
See `NOT_DOING.md`:
- **Konfuzio:** a document-AI API that would do the reading for us, which removes the browser work.
- **Public disposable inboxes:** need a real sending account, are publicly readable, and may block bots.
- **A fake inbox page in our app:** a fallback only, since it shows nothing about unfamiliar sites.

---

## X4. PASS contact form (low value)

**Verified 2026-11-07:**
- PASS has one national form at `https://pass-scotland.org.uk/contact/`: a required privacy checkbox; Name, Postcode, Phone, Email, **Email again**; "Any other information"; invisible reCAPTCHA.
- The Citizens Advice bureau finder (`cas.org.uk/get-advice`) leads to a local bureau site with **no online form**. Its cookie banner blocked the search until declined, and Enter did not submit.

**Shortcoming:** every user ends at the same national form, the same shape as forms we already fill (padding by the backlog's rule).

**If built:** a small optional action on the complaint track, stopping before Send behind the D45 gate.

---

## Suggested order
1. **The Drummond Miller intake form:**
   - Yes/No answers carried over from steps 1 and 2
   - the someone-else branch
   - asking the user for the narrative answers it does not have
   - stop before Send
2. **X2 around it:** register -> find the person (nickname matching) -> per-person form (Anderson Strathern), specialised form (Drummond Miller) or general form addressed to the person (Balfour + Manson) -> next specialist when not found (Irwin Mitchell).
3. **X1**, demo only, after file uploads exist and a decision allows the local inbox.
4. **X4** only with spare time.
