// UK personas. Phones are in Ofcom's drama range (07700 900xxx), emails are @example.com. Only the hospitals are real.
import { DEMO_PERSONAS } from "../agent/sample";
import england from "../../scripts/personas/england.json";
import northernIreland from "../../scripts/personas/northern-ireland.json";
import wales from "../../scripts/personas/wales.json";
import type { CaseFacts } from "../agent/facts";
import { persona } from "./build";
import type { Persona } from "./types";

const UK = "United Kingdom";
// The benchmark personas in scripts/personas/*.json stay the source for their story; here the place is confirmed.
const fromJson = (j: unknown, region: string): CaseFacts => ({ ...(j as CaseFacts), country: UK, region });

const [callum, ailsa] = DEMO_PERSONAS;

export const UK_PERSONAS: Persona[] = [
  // Scotland: the original demo patients, exactly as before (same facts, drafts and recordings by place).
  {
    id: "scotland-ailsa-wrist",
    name: ailsa.name,
    blurb: "A broken wrist bone was called a sprain at A&E. It has not healed and she now needs surgery.",
    place: "Edinburgh, Scotland",
    group: "UK",
    category: "Missed fracture",
    tests: "The polished Scotland path, compensation",
    facts: ailsa.facts,
    draft: ailsa.draft,
    messages: ailsa.messages,
  },
  {
    id: "scotland-callum-dose",
    name: callum.name,
    blurb: "Given double the right dose of anti-sickness medicine after day surgery. Recovered in two days.",
    place: "Edinburgh, Scotland",
    group: "UK",
    category: "Medication error",
    tests: "A complaint only, no compensation",
    facts: callum.facts,
    draft: callum.draft,
    messages: callum.messages,
  },

  persona({
    id: "england-megan-wrist",
    blurb: "A broken wrist bone was called a sprain at A&E and has not healed. Same story as the other benchmark cases.",
    city: "London, England",
    group: "UK",
    category: "Missed fracture",
    tests: "Benchmark: the same case in another country",
    facts: { ...fromJson(england, "England"), title: "Ms" },
  }),
  persona({
    id: "england-priya-sepsis",
    blurb: "Sent home two days after surgery with a fever. Back by ambulance, four days in intensive care with sepsis.",
    city: "Leicester, England",
    group: "UK",
    category: "Missed sepsis",
    tests: "High harm, lost income, England's own routes",
    facts: {
      title: "Ms",
      firstName: "Priya",
      lastName: "Nair",
      address: "9 Example Close, Leicester",
      postcode: "LE2 1AA",
      phone: "07700 900311",
      email: "priya.nair@example.com",
      preferredContact: "Email",
      country: UK,
      region: "England",
      incidentLocation: "Leicester Royal Infirmary, general surgery ward",
      incidentSummary:
        "I had a planned hysterectomy. Two days later I was sent home even though my chart showed a temperature of 38.1 and a fast heartbeat, and nobody explained why. By the next day I could hardly stand. I went back by ambulance and was treated for sepsis in intensive care. I was told afterwards it might have been caught earlier. I am self-employed and could not work for three months.",
      events: [
        { date: "2026-06-16", what: "Planned hysterectomy at Leicester Royal Infirmary." },
        { date: "2026-06-18", what: "Discharged home. My chart showed a temperature of 38.1 and a fast heartbeat; no one explained this to me." },
        { date: "2026-06-19", what: "Collapsed at home, taken in by ambulance, diagnosed with sepsis from a pelvic infection and moved to intensive care." },
        { date: "2026-06-23", what: "Moved out of intensive care to a ward." },
        { date: "2026-07-02", what: "Went home. Off work until the end of September." },
      ],
      desiredOutcome: "An explanation of why I was sent home, an apology, changes to how fevers are checked before discharge, and compensation for my lost income.",
    },
  }),
  persona({
    id: "england-marcus-bowel",
    blurb: "Months of bleeding were treated as piles. The urgent cancer referral came too late. Stage 3 bowel cancer.",
    city: "Manchester, England",
    group: "UK",
    category: "Delayed cancer diagnosis",
    tests: "A GP surgery, vague dates, no phone number given",
    facts: {
      title: "Mr",
      firstName: "Marcus",
      lastName: "Bell",
      address: "58 Sample Avenue, Chorlton, Manchester",
      postcode: "M21 9AA",
      email: "marcus.bell@example.com",
      preferredContact: "Email",
      country: UK,
      region: "England",
      incidentLocation: "My GP surgery in Chorlton, Manchester, then Wythenshawe Hospital",
      incidentSummary:
        "I told my GP about bleeding when I went to the toilet. I was told it was piles and given cream. I went back twice more over the next months, getting more tired and losing weight, before an urgent referral was made. At Wythenshawe Hospital I was told I have bowel cancer that had spread to nearby lymph nodes. I think it would have been smaller if it had been looked into earlier.",
      events: [
        { date: "around February 2026", what: "First told my GP about bleeding. Told it was piles, given cream, no examination or tests." },
        { date: "April 2026", what: "Went back, still bleeding and very tired. Told to keep using the cream." },
        { date: "early July 2026", what: "Third visit. A different GP made an urgent referral." },
        { date: "late July 2026", what: "Colonoscopy at Wythenshawe Hospital." },
        { date: "August 2026", what: "Told it is bowel cancer in the lymph nodes. Surgery and chemotherapy planned." },
      ],
      desiredOutcome: "An explanation of why I was not referred sooner, and to know whether I can claim compensation.",
    },
  }),
  persona({
    id: "england-eleni-dental",
    blurb: "The dentist took out a healthy tooth, not the painful one. A numb lip has not gone away.",
    city: "Newcastle upon Tyne, England",
    group: "UK",
    category: "Dental care",
    tests: "An NHS dentist, a different regulator",
    facts: {
      title: "Ms",
      firstName: "Eleni",
      lastName: "Costa",
      address: "27 Sample Gardens, Gosforth, Newcastle upon Tyne",
      postcode: "NE3 1AA",
      phone: "07700 900254",
      email: "eleni.costa@example.com",
      preferredContact: "Email",
      country: UK,
      region: "England",
      incidentLocation: "An NHS dental practice in Gosforth, Newcastle upon Tyne",
      incidentSummary:
        "I went in with a painful lower back tooth on the left. The dentist took out the healthy tooth next to it. When I said the pain was still there she said it could not be helped. A second dentist confirmed the wrong tooth had been removed and took out the right one. Since then my lower lip and chin on that side have been numb.",
      events: [
        { date: "2026-03-12", what: "Went in with a painful lower left molar. The neighbouring healthy tooth was taken out by mistake." },
        { date: "2026-03-14", what: "Rang the practice because the pain was unchanged; was told this could not be helped." },
        { date: "2026-04-02", what: "A second dentist confirmed the wrong tooth had been removed and extracted the painful one." },
        { date: "2026-04-20", what: "Lip and chin still numb on the left; told it may take months or be permanent." },
      ],
      desiredOutcome: "An explanation, an apology, and compensation for the lost tooth, the numbness and the cost of the second treatment.",
    },
  }),
  persona({
    id: "england-harold-carehome",
    blurb: "His mother's pressure sore in a care home went unreported and became infected. The care was a year ago.",
    city: "Bristol, England",
    group: "UK",
    category: "Care home neglect",
    tests: "Someone else's care, a care home, time limits close",
    facts: {
      complainingFor: "someone_else",
      title: "Mr",
      firstName: "Harold",
      lastName: "Pryce",
      address: "4 Example Row, Bishopston, Bristol",
      postcode: "BS7 8AA",
      phone: "07700 900946",
      email: "harold.pryce@example.com",
      preferredContact: "Email",
      country: UK,
      region: "England",
      incidentLocation: "A council-funded residential care home in Bristol, then Southmead Hospital",
      incidentSummary:
        "My mother is 86 and has dementia. In the care home a pressure sore on her heel was not reported to us or to a nurse for days and it became infected. We only found it on a visit. She needed hospital treatment. We have not had a straight answer from the home about how long it was left. I am making the complaint for her, with her agreement.",
      events: [
        { date: "2025-10-03", what: "Staff did not record or report a sore on my mother's heel after she had been left in a chair for long periods." },
        { date: "2025-10-14", what: "I found the sore on a visit; it was red, open and smelled. The GP was called." },
        { date: "2025-10-20", what: "Admitted to Southmead Hospital with an infected pressure ulcer and given antibiotics." },
        { date: "2025-11-10", what: "Discharged to a different care home at the family's request." },
      ],
      desiredOutcome: "An explanation, an apology, changes to how the home checks residents' skin, and to know whether we can claim compensation.",
    },
  }),

  persona({
    id: "wales-elin-wrist",
    blurb: "A broken wrist bone was called a sprain at A&E and has not healed. Same story as the other benchmark cases.",
    city: "Cardiff, Wales",
    group: "UK",
    category: "Missed fracture",
    tests: "Benchmark: Wales has recorded runs",
    facts: { ...fromJson(wales, "Wales"), title: "Ms" },
  }),
  persona({
    id: "wales-rhys-discharge",
    blurb: "Sent home the day after a hip replacement with no physio. Fell that night and needed the hip put back.",
    city: "Swansea, Wales",
    group: "UK",
    category: "Discharged too early",
    tests: "Wales: its own complaint and redress rules",
    facts: {
      title: "Mr",
      firstName: "Rhys",
      lastName: "Pritchard",
      address: "3 Heol Enghraifft, Sketty, Swansea",
      postcode: "SA2 8AA",
      phone: "07700 900622",
      email: "rhys.pritchard@example.com",
      preferredContact: "Email",
      country: UK,
      region: "Wales",
      incidentLocation: "Morriston Hospital, Swansea (orthopaedic ward)",
      incidentSummary:
        "I had a hip replacement. The next day I was discharged before I had seen a physiotherapist or been shown how to move safely, and with only a few painkillers. That night I fell at home and the new hip dislocated. I went back by ambulance and had to be put under anaesthetic to put it back. I was in hospital another week and my recovery is months behind.",
      events: [
        { date: "2026-08-04", what: "Hip replacement at Morriston Hospital." },
        { date: "2026-08-05", what: "Discharged without seeing a physiotherapist, with no walking frame or instructions." },
        { date: "2026-08-05", what: "Fell at home that night; the new hip dislocated; taken back by ambulance." },
        { date: "2026-08-06", what: "Hip put back under anaesthetic. Stayed in hospital until 12 August." },
      ],
      desiredOutcome: "An explanation, an apology, changes to how patients are cleared for discharge, and compensation for the extra pain and time off work.",
    },
  }),

  persona({
    id: "ni-orla-wrist",
    blurb: "A broken wrist bone was called a sprain at A&E and has not healed. Same story as the other benchmark cases.",
    city: "Belfast, Northern Ireland",
    group: "UK",
    category: "Missed fracture",
    tests: "Benchmark: the same case in another country",
    facts: { ...fromJson(northernIreland, "Northern Ireland"), title: "Ms" },
  }),
  persona({
    id: "ni-aisling-crisis",
    blurb: "Went to A&E in a mental health crisis and was told the crisis team would call within a day. Nobody did for three weeks.",
    city: "Derry, Northern Ireland",
    group: "UK",
    category: "Mental health care",
    tests: "No postcode given, a gentle subject, ombudsman only",
    facts: {
      title: "Ms",
      firstName: "Aisling",
      lastName: "Doherty",
      address: "12 Example Park, Derry",
      phone: "07700 900483",
      email: "aisling.doherty@example.com",
      preferredContact: "Email",
      country: UK,
      region: "Northern Ireland",
      incidentLocation: "Emergency Department, Altnagelvin Hospital, Derry (and the community crisis service)",
      incidentSummary:
        "I went to A&E in a mental health crisis. I was seen briefly and told the crisis team would phone me within 24 hours. They did not. I rang twice and was told I was on a list. About three weeks later I was so unwell that my sister took me back to A&E and I was admitted. I would like to know why no one followed up and what is done so others are not left waiting.",
      events: [
        { date: "2026-07-09", what: "Went to A&E at Altnagelvin in a mental health crisis; told the crisis team would call within 24 hours." },
        { date: "2026-07-12", what: "Rang the service; told I was on a list." },
        { date: "2026-07-20", what: "Rang again; told someone would be in touch. No one was." },
        { date: "2026-07-30", what: "Taken back to A&E by my sister and admitted to a mental health ward for two weeks." },
      ],
      desiredOutcome: "An explanation, an apology, and changes so that nobody is left without a call after a crisis.",
    },
  }),
];
