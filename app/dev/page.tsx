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
      <h1 className="text-2xl font-semibold">Browser agent</h1>
      <p className="text-sm text-zinc-500">
        Opens a visible browser and searches the Law Society of Scotland directory for Edinburgh
        accident and injury firms.
      </p>
      <button
        onClick={run}
        disabled={running}
        className="w-fit rounded-md bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {running ? "Searching…" : "Search for something"}
      </button>

      {result && "error" in result && <p className="text-red-600">Error: {result.error}</p>}
      {result && "firms" in result && (
        <section className="flex flex-col gap-3">
          <p className="text-sm text-zinc-500">
            {result.total ?? "?"} results found, showing {result.firms.length}
          </p>
          <ul className="flex flex-col gap-2">
            {result.firms.map((f) => (
              <li key={f.name + f.address} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="font-medium">{f.name}</div>
                <div className="text-sm text-zinc-500">{f.address}</div>
                <div className="text-xs text-zinc-500">
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
