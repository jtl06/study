import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}

export function getD1() {
  if (!env.DB) {
    throw new Error("The study database is unavailable.");
  }

  return env.DB;
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema() {
  if (!schemaReady) {
    const d1 = getD1();
    schemaReady = d1
      .batch([
        d1.prepare(`CREATE TABLE IF NOT EXISTS solutions (
          subject_slug TEXT NOT NULL,
          problem_id TEXT NOT NULL,
          content TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'not-started',
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (subject_slug, problem_id)
        )`),
        d1.prepare(
          "CREATE INDEX IF NOT EXISTS solutions_updated_at_idx ON solutions(updated_at)",
        ),
        d1.prepare(`CREATE TABLE IF NOT EXISTS grades (
          subject_slug TEXT NOT NULL,
          problem_id TEXT NOT NULL,
          score INTEGER NOT NULL,
          verdict TEXT NOT NULL,
          summary TEXT NOT NULL,
          strengths TEXT NOT NULL,
          improvements TEXT NOT NULL,
          next_step TEXT NOT NULL,
          confidence TEXT NOT NULL,
          model TEXT NOT NULL,
          solution_snapshot TEXT NOT NULL,
          graded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (subject_slug, problem_id)
        )`),
        d1.prepare(
          "CREATE INDEX IF NOT EXISTS grades_graded_at_idx ON grades(graded_at)",
        ),
        d1.prepare(`CREATE TABLE IF NOT EXISTS model_usage_daily (
          usage_date TEXT NOT NULL,
          model TEXT NOT NULL,
          used_tokens INTEGER NOT NULL DEFAULT 0,
          reserved_tokens INTEGER NOT NULL DEFAULT 0,
          request_count INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (usage_date, model)
        )`),
        d1.prepare(`CREATE TABLE IF NOT EXISTS grading_rate_limits (
          window_start TEXT NOT NULL PRIMARY KEY,
          request_count INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
      ])
      .then(() => undefined);
  }

  return schemaReady;
}
