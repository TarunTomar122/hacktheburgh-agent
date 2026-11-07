import type { AgentEvent } from "../../lib/agent/events";

export type DoneEvent = Extract<AgentEvent, { type: "done" }>;

/** One progress line for the UI from an agent event. */
export function describe(event: Exclude<AgentEvent, { type: "done" }>): string {
  return event.type === "status" ? event.message
    : event.type === "observe" ? `Step ${event.step}: inspecting ${event.fields} page elements`
    : event.type === "blocked" ? event.reason
    : `Step ${event.step}: ${event.tool} — ${event.result}`;
}

/**
 * POST a body to an agent route that streams newline-delimited events, and report progress until the "done" event.
 * Throws if the server rejects the request, the stream sends an error, or it ends without a result.
 */
export async function streamAgent(url: string, body: unknown, onProgress: (line: string) => void): Promise<DoneEvent> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Could not start the browser agent");
  if (!res.body) throw new Error("The browser agent returned no progress stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let done: DoneEvent | null = null;
  const receive = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as AgentEvent | { type: "error"; message: string };
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "done") done = event;
    else onProgress(describe(event));
  };
  try {
    while (true) {
      const { value, done: finished } = await reader.read();
      pending += decoder.decode(value, { stream: !finished });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(receive);
      if (finished) break;
    }
    receive(pending);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!done) throw new Error("The browser connection ended before a result. You can retry.");
  return done;
}

/** Close the agent's browser (and so its live panel). Used when the user says they are done with a form (D54). */
export function closeAgentBrowser() {
  return fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "close" }) }).catch(() => {});
}
