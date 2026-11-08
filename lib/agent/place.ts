import { z } from "zod";
import type { CaseFacts } from "./facts";
import { modelFor, structured } from "./llm";
import type { Place } from "./routeTypes";

/** Where the patient is and where the care happened, read from what they told us. No lookup tables: the model reads it. */
const PlaceSchema = z.object({
  country: z.string().describe("Country where the care happened, in English, e.g. 'United Kingdom'. Empty if it cannot be told."),
  region: z.string().describe("The part of the country whose health and legal system applies, only if the country has several (e.g. 'Scotland', 'Wales', 'England', 'Northern Ireland', a US state, an Australian state). Never a city, district or local health area. Empty if the whole country has one system, or if unknown."),
  city: z.string().describe("City or town of the care. Empty if unknown."),
  hospital: z.string().describe("Hospital or service where the care happened, as the patient said it."),
  careSetting: z.enum(["public", "private", "unknown"]).describe("Was it public (state-funded) care or private care, if the patient's words show it."),
  why: z.string().describe("One short line: what in the patient's words shows this (e.g. 'Royal Infirmary of Edinburgh; address in Edinburgh EH11')."),
});

export async function detectPlace(facts: CaseFacts): Promise<Place> {
  return structured({
    ...modelFor("check", ["identity"]), // the address and story: on this Mac by default
    instructions: "Work out where a patient's care happened from their own words and address. Never guess a country you cannot tell; leave it empty.",
    input: JSON.stringify({ address: facts.address, postcode: facts.postcode, whereTreated: facts.incidentLocation, story: facts.incidentSummary, events: facts.events }),
    schema: PlaceSchema,
    name: "place",
    data: ["identity"],
  });
}
