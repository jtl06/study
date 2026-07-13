import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const solutions = sqliteTable(
  "solutions",
  {
    subjectSlug: text("subject_slug").notNull(),
    problemId: text("problem_id").notNull(),
    content: text("content").notNull().default(""),
    status: text("status").notNull().default("not-started"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.subjectSlug, table.problemId] })],
);

export const grades = sqliteTable(
  "grades",
  {
    subjectSlug: text("subject_slug").notNull(),
    problemId: text("problem_id").notNull(),
    score: integer("score").notNull(),
    verdict: text("verdict").notNull(),
    summary: text("summary").notNull(),
    strengths: text("strengths").notNull(),
    improvements: text("improvements").notNull(),
    nextStep: text("next_step").notNull(),
    confidence: text("confidence").notNull(),
    model: text("model").notNull(),
    solutionSnapshot: text("solution_snapshot").notNull(),
    gradedAt: text("graded_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.subjectSlug, table.problemId] })],
);

export const modelUsageDaily = sqliteTable(
  "model_usage_daily",
  {
    usageDate: text("usage_date").notNull(),
    model: text("model").notNull(),
    usedTokens: integer("used_tokens").notNull().default(0),
    reservedTokens: integer("reserved_tokens").notNull().default(0),
    requestCount: integer("request_count").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.usageDate, table.model] })],
);

export const gradingRateLimits = sqliteTable("grading_rate_limits", {
  windowStart: text("window_start").primaryKey(),
  requestCount: integer("request_count").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
