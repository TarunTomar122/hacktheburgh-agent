"use client";

import { useState } from "react";

type Firm = { name: string; address: string; legalAid: boolean; partners: number | null };
type Result = { total: number | null; firms: Firm[] } | { error: string };

export default function DevSearch() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/search", { method: "POST" });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-10">
      <div>
        <h1 className="display text-4xl">
          Browser <span className="hl-violet">agent</span>
        </h1>
      </div>
      <p className="text-sm text-muted">
        Opens a visible browser and searches the Law Society of Scotland directory for Edinburgh
        accident and injury firms.
      </p>
      <button onClick={run} disabled={running} className="btn-primary w-fit">
        {running ? "Searching…" : "Search for something"}
      </button>

      {result && "error" in result && <p className="text-danger">Error: {result.error}</p>}
      {result && "firms" in result && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {result.total ?? "?"} results found, showing {result.firms.length}
          </p>
          <ul className="flex flex-col gap-2">
            {result.firms.map((f) => (
              <li key={f.name + f.address} className="card p-3">
                <div className="font-medium text-ink">{f.name}</div>
                <div className="text-sm text-muted">{f.address}</div>
                <div className="text-xs text-muted">
                  {f.legalAid ? "Legal aid · " : ""}
                  {f.partners ?? "?"} partners
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
