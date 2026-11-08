# Ailsa's case, step by step

Ailsa Reid is a fictional patient in Edinburgh. She fell on her outstretched hand, and A&E X-rayed her wrist, called it a sprain and sent her home. The co-codamol she was given made her very sick and dizzy. Weeks later a scaphoid fracture was found. It has not healed, she now needs surgery, and she has missed her second-year exams and shifts at her part-time job.

This is what Elliot's crew does with her story, from the first sentence to forms ready to send. The times are from one recorded run (research 49 s, case 2 min 24 s).

## 1. Onboarding

Ailsa tells her story in her own words. One question appears at a time, each with the right input: date pickers, a postcode check, choice buttons. Elliot only asks for what the later steps need. Her facts are saved to her account, so she can pick the case up on any device.

## 2. Research: how it works where she lives

Elliot splits the research between the crew, and they work at the same time:

- **Robin** finds the official pages for complaints, the ombudsman, compensation, time limits, free help and medical records.
- **Iona** finds who publishes clinical guidelines in Scotland.
- **Nell** finds how legal costs can be paid.

Most pages are read with a plain request. A real browser opens only when a page needs one. Every fact on the route map is a quote that code finds on the page, with its link and a confidence label: **Solid** when two official sources agree, **Likely** when one does.

The result is her route: complain to the NHS health board first, then the Scottish Public Services Ombudsman. Compensation is a claim within three years, through a specialist solicitor, and legal aid is checked by the Scottish Legal Aid Board. Free help comes from PASS, and SIGN publishes the clinical guidelines.

## 3. Choose a path

Elliot recommends a track, with the reasons ticked against her story: **answers** (a complaint and an apology) or **compensation**. Ailsa needs surgery and has lost income, so compensation fits her best.

## 4. Prepare your case

The five agents work at once, each in its own browser tab, live inside the app.

- **Nell** opens the Scottish Legal Aid Board's own eligibility checker and answers it page by page. When a question needs Ailsa (benefits, income, outgoings, savings), Nell asks it in the checker's own words, and the browser comes to the front so Ailsa can see the page. Nell then reads the estimate word for word.
- **Robin** searches the Law Society of Scotland's register with its own search filters and finds firms through the search API. He then opens each firm's own website to check that it acts for patients and works on no win, no fee. Seven firms are checked on their own sites.
- **Iona** finds a published guideline on suspected scaphoid fractures and quotes the point that applies. She compares it with Ailsa's timeline, which gives a possible gap in care for a solicitor to look at, and she looks for published decisions in similar cases.
- **Elliot** follows the reports and replans as they arrive. When the checker says legal aid is unlikely, the route becomes no win, no fee. He shortlists three firms with a fit score that opens into its reasons.
- **Kit** opens each shortlisted firm's own enquiry form and fills it in with a message that carries Nell's result and Iona's point. A firm without an online form is swapped for the next best one. Each form stops before Send.

In this run, Thompsons Scotland, Slater + Gordon and Jones Whyte all had their forms filled (7, 4 and 6 answers).

## 5. Contact lawyers

Ailsa sees every filled form: what was typed, which consent boxes the firm asks for, and the message. She can change any field, and the change is typed into the real form. Only the boxes she ticks are ticked. She presses Send herself.

## 6. Report a medicine problem (optional)

Her story mentions co-codamol, so an optional step appears:

- **Robin** finds the UK's medicines regulator (the MHRA) and its Yellow Card reporting page.
- **Iona** reads the medicine, the reaction and how bad it was from her story, on her own machine.
- **Kit** explores to the report form, fills it page by page, and stops before the final submit.

## 7. The case file

Everything ends in one case file:
- the route with its sources
- the funding result
- the firms and why they fit
- the guideline point
- the filled forms
- the full trace of every agent's steps, with screenshots

A one-click PDF bundle summarises it: the route and its sources, the funding result, each firm's checks, and the status of each enquiry.

## The same story anywhere

The crew discovers all of this live. Give it the same story in Dublin, Auckland or San Francisco and it finds that place's own complaints body, independent reviewer, compensation route, funding and firms. In Auckland, for example, that is the Health and Disability Commissioner and ACC. `/compare` plays the four side by side.
