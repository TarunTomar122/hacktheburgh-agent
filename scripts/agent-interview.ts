// Chat with the intake agent in the terminal. `--sim` makes an LLM play Ailsa so you can watch a whole interview.
process.env.HANDOFF_WAIT_MS ??= "0";
import readline from "node:readline/promises";
import { emptyFacts } from "../lib/agent/facts";
import { interviewTurn, OPENER, type ChatMessage } from "../lib/agent/interview";
import { MODELS, openai } from "../lib/agent/llm";

const PERSONA = `You are Ailsa Reid, 21, a student in Edinburgh. You are anxious and not good with formal language. Answer the assistant's question briefly, in plain words, giving only what is asked (you may add a little). Your facts:
- In early July 2026 you fell on your outstretched hand and went to A&E at the Royal Infirmary of Edinburgh. They X-rayed your wrist, said sprain, sent you home.
- Pain continued. About six weeks later your GP sent you back and a second X-ray showed a fractured scaphoid (wrist bone).
- It has not healed and you now need surgery.
- Address 14 Example Street, Edinburgh EH1 1AA. Phone 07700 900123. Email ailsa.reid@example.com. You prefer email.
- You want an explanation of why it was missed, and an apology.
- If asked to accept the email risk, you say yes.
- The complaint is about your own care. Do not volunteer details that were not asked for.`;

async function simUser(messages: ChatMessage[]): Promise<string> {
  const transcript = messages.map((m) => `${m.role === "agent" ? "Assistant" : "Ailsa"}: ${m.content}`).join("\n");
  const r = await openai().responses.create({ model: MODELS.interview, reasoning: { effort: "none" }, instructions: PERSONA, input: `${transcript}\nAilsa:` });
  return r.output_text.trim();
}

async function main() {
  const sim = process.argv.includes("--sim");
  const rl = sim ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
  const messages: ChatMessage[] = [OPENER];
  let facts = emptyFacts();
  console.log(`\nAgent: ${OPENER.content}`);

  for (let turn = 1; turn <= 14; turn++) {
    const answer = sim ? await simUser(messages) : (await rl!.question("\nYou: ")).trim();
    if (sim) console.log(`\nYou: ${answer}`);
    messages.push({ role: "user", content: answer });

    const t = Date.now();
    const r = await interviewTurn(messages, facts);
    facts = r.facts;
    messages.push({ role: "agent", content: r.reply });
    console.log(`\nAgent: ${r.reply}   [${Date.now() - t}ms, missing: ${r.missing.join(", ") || "none"}]`);
    if (r.done) break;
  }
  console.log("\nFACTS", JSON.stringify(facts, null, 2));
  rl?.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
