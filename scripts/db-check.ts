// Checks the saved-cases database: connects, creates the table if it is missing, writes and reads back a throwaway row, removes it.
// Usage: npm run db:check     (reads DATABASE_URL from .env.local)
import { dbEnabled, getSaved, putSaved, removeSaved } from "../lib/db";

async function main() {
  if (!dbEnabled()) {
    console.log("DATABASE_URL is not set: saved cases stay in the browser. Nothing to check.");
    return;
  }
  const id = `db-check|${Date.now()}`;
  const at = new Date();
  const t0 = Date.now();
  const put = await putSaved(id, "db-check@example.com", { facts: { check: true } }, at);
  const got = await getSaved(id);
  await removeSaved(id);
  const ok = put.ok && got?.updatedAt === at.toISOString();
  console.log(ok ? `OK: wrote, read and removed a row in ${Date.now() - t0} ms.` : `FAILED: ${JSON.stringify({ put, got })}`);
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
