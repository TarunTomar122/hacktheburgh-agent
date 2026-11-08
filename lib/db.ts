import { Pool } from "pg";

/**
 * Saved cases in Postgres (Tiger Data), one row per signed-in user (D75). Server only.
 * Off unless DATABASE_URL is set: then nothing here runs and the browser keeps the case on its own, as before.
 *
 * The row is keyed by the Auth0 user id (`sub`). The email is stored next to it so a row can be traced to a person; it is
 * never used as the key (an email can change, the id cannot). "Delete all my data" removes the row outright (D79); the user's other
 * devices notice the missing row and clear their own copy (see lib/profile.ts).
 */

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

const g = globalThis as unknown as { __casePool?: Pool; __caseSchema?: Promise<void> };

function connectionConfig() {
  const url = new URL(process.env.DATABASE_URL!.trim());
  // Fallback if the server's certificate cannot be verified from here: DATABASE_SSL_NO_VERIFY=1 keeps the connection encrypted
  // but skips the identity check. The URL's own sslmode is dropped because node-postgres lets it override this setting.
  if (process.env.DATABASE_SSL_NO_VERIFY === "1") {
    url.searchParams.delete("sslmode");
    return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } };
  }
  return { connectionString: url.toString() };
}

function pool(): Pool {
  if (!g.__casePool) {
    g.__casePool = new Pool({
      ...connectionConfig(),
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 8000,
      query_timeout: 10000,
    });
    // An idle connection dropped by the server must not crash the process.
    g.__casePool.on("error", (e) => console.error("[db] idle connection error:", e.message));
  }
  return g.__casePool;
}

/** Creates the table the first time it is needed, so a wiped or brand-new database works without a separate step. */
export function ensureSchema(): Promise<void> {
  g.__caseSchema ??= pool()
    .query(
      `CREATE TABLE IF NOT EXISTS case_profiles (
         user_id text PRIMARY KEY,
         email text,
         profile jsonb,
         profile_updated_at timestamptz NOT NULL,
         saved_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    .then(() => undefined)
    .catch((e) => {
      g.__caseSchema = undefined; // try again next time
      throw e;
    });
  return g.__caseSchema;
}

export type SavedCase = { profile: unknown | null; updatedAt: string };

export async function getSaved(userId: string): Promise<SavedCase | null> {
  await ensureSchema();
  const r = await pool().query<{ profile: unknown | null; profile_updated_at: Date }>(
    "SELECT profile, profile_updated_at FROM case_profiles WHERE user_id = $1",
    [userId],
  );
  const row = r.rows[0];
  return row ? { profile: row.profile, updatedAt: row.profile_updated_at.toISOString() } : null;
}

/**
 * Saves the case unless the saved copy is newer (the newest change wins, judged by the profile's own `updatedAt`).
 * `profile` null records a deletion. Returns the newer saved copy when this one lost.
 */
export async function putSaved(
  userId: string,
  email: string | null,
  profile: unknown | null,
  updatedAt: Date,
): Promise<{ ok: true } | { ok: false; current: SavedCase }> {
  await ensureSchema();
  const r = await pool().query(
    `INSERT INTO case_profiles (user_id, email, profile, profile_updated_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET email = EXCLUDED.email, profile = EXCLUDED.profile, profile_updated_at = EXCLUDED.profile_updated_at, saved_at = now()
       WHERE case_profiles.profile_updated_at <= EXCLUDED.profile_updated_at
     RETURNING user_id`,
    [userId, email, profile === null ? null : JSON.stringify(profile), updatedAt],
  );
  if (r.rowCount) return { ok: true };
  const current = await getSaved(userId);
  return { ok: false, current: current ?? { profile: null, updatedAt: updatedAt.toISOString() } };
}

/** Removes a row outright: what "Delete all my data" does (D79). Nothing about the user is kept. */
export async function removeSaved(userId: string): Promise<void> {
  await ensureSchema();
  await pool().query("DELETE FROM case_profiles WHERE user_id = $1", [userId]);
}
