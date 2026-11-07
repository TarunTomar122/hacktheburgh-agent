// Grade a discovery route map against the research answer key (never shown to the agent):
//   npx tsx --env-file=.env.local scripts/grade-route.ts .runs/<runId>/route.json docs/research/jurisdictions/wales.md
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { MODELS, structured } from "../lib/agent/llm";

const Grade = z.object({
  parts: z.array(
    z.object({
      kind: z.enum(["complaint", "escalation", "compensation", "funding", "lawyers", "guideline", "advice", "records"]),
      found: z.boolean().describe("Did the agent record this part at all?"),
      body: z.enum(["right", "partly", "wrong", "missing"]).describe("Is the organisation the right one per the answer key?"),
      facts: z.enum(["right", "partly", "wrong", "missing"]).describe("Are the key facts (time limit, how to apply, conditions) right per the answer key?"),
      page: z.enum(["form_found", "right_page", "wrong_page", "none"]).describe("Did the agent reach the actual online form (if one exists) or the right page?"),
      note: z.string().describe("One short line: what was right or wrong"),
    }),
  ),
  score: z.number().describe("Overall 0-10: how useful and correct this route map is for the patient, judged against the answer key. 10 = all right and every form found."),
  smart: z.string().describe("The most impressive thing the agent found or worked out, if any (e.g. noticed a renamed scheme)."),
  worst: z.string().describe("The most important mistake or miss."),
});

async function main() {
  const [routePath, keyPath] = process.argv.slice(2);
  const route = readFileSync(routePath, "utf8");
  const key = readFileSync(keyPath, "utf8");
  const g = await structured({
    model: MODELS.draft,
    effort: "medium",
    instructions: "You grade an AI agent's route map (how a patient complains and claims after harm from hospital care, for one place) against a researched answer key. Be strict and fair. The answer key may itself be slightly out of date; if the agent's claim is backed by a checked quote from an official page and contradicts the key, judge on the evidence and say so.",
    input: `ANSWER KEY:\n${key.slice(0, 30000)}\n\nAGENT'S ROUTE MAP (JSON):\n${route.slice(0, 30000)}`,
    schema: Grade,
    name: "route_grade",
  });
  const out = path.join(path.dirname(routePath), "grade.json");
  writeFileSync(out, JSON.stringify(g, null, 2));
  console.log(`SCORE ${g.score}/10\nSmart: ${g.smart}\nWorst: ${g.worst}`);
  for (const p of g.parts) console.log(`- ${p.kind}: found=${p.found} body=${p.body} facts=${p.facts} page=${p.page} | ${p.note}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
