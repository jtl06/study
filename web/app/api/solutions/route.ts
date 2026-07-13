import { ensureSchema, getD1 } from "../../../db";

const statuses = new Set(["not-started", "working", "review", "done"]);

type SolutionRow = {
  subject_slug: string;
  problem_id: string;
  content: string;
  status: string;
  updated_at: string;
};

function present(row: SolutionRow) {
  return {
    subjectSlug: row.subject_slug,
    problemId: row.problem_id,
    content: row.content,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: Request) {
  await ensureSchema();
  const url = new URL(request.url);
  const subjectSlug = url.searchParams.get("subjectSlug")?.trim();
  const problemId = url.searchParams.get("problemId")?.trim();
  const d1 = getD1();

  if (subjectSlug && problemId) {
    const row = await d1
      .prepare(
        `SELECT subject_slug, problem_id, content, status, updated_at
         FROM solutions
         WHERE subject_slug = ? AND problem_id = ?`,
      )
      .bind(subjectSlug, problemId)
      .first<SolutionRow>();

    return Response.json({
      solution: row
        ? present(row)
        : {
            subjectSlug,
            problemId,
            content: "",
            status: "not-started",
            updatedAt: null,
          },
    });
  }

  const result = await d1
    .prepare(
      `SELECT subject_slug, problem_id, content, status, updated_at
       FROM solutions
       ORDER BY updated_at DESC`,
    )
    .all<SolutionRow>();

  return Response.json({ solutions: result.results.map(present) });
}

export async function PUT(request: Request) {
  await ensureSchema();
  const payload = (await request.json()) as {
    subjectSlug?: string;
    problemId?: string;
    content?: string;
    status?: string;
  };
  const subjectSlug = payload.subjectSlug?.trim() ?? "";
  const problemId = payload.problemId?.trim() ?? "";
  const content = payload.content ?? "";
  const status = payload.status?.trim() ?? "not-started";

  if (!subjectSlug || !problemId) {
    return Response.json(
      { error: "subjectSlug and problemId are required" },
      { status: 400 },
    );
  }
  if (!statuses.has(status)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  const d1 = getD1();
  await d1
    .prepare(
      `INSERT INTO solutions (subject_slug, problem_id, content, status, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(subject_slug, problem_id) DO UPDATE SET
         content = excluded.content,
         status = excluded.status,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(subjectSlug, problemId, content, status)
    .run();

  const row = await d1
    .prepare(
      `SELECT subject_slug, problem_id, content, status, updated_at
       FROM solutions
       WHERE subject_slug = ? AND problem_id = ?`,
    )
    .bind(subjectSlug, problemId)
    .first<SolutionRow>();

  return Response.json({ solution: row ? present(row) : null });
}
