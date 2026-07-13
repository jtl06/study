import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(webRoot, "..");
const inventoryDir = resolve(repoRoot, "notebooks/problem-inventories");
const statementsPath = resolve(repoRoot, "notebooks/problem-statements.csv");
const outputPath = resolve(webRoot, "public/problems.json");

function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  if (!rows.length) return [];

  const headers = rows[0];
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

const statementRows = parseCsv(await readFile(statementsPath, "utf8"));
const statements = new Map(
  statementRows.map((row) => [`${row.subject_slug}:${row.problem_id}`, row.statement]),
);

const inventoryFiles = (await readdir(inventoryDir))
  .filter((name) => name.endsWith(".csv"))
  .sort();
const problems = [];

for (const filename of inventoryFiles) {
  const rows = parseCsv(await readFile(resolve(inventoryDir, filename), "utf8"));
  for (const row of rows) {
    if (!row.subject_slug || !row.problem_id) continue;
    problems.push({
      key: `${row.subject_slug}:${row.problem_id}`,
      subjectSlug: row.subject_slug,
      subjectTitle: row.subject_title,
      source: row.source,
      chapter: row.chapter,
      chapterTitle: row.chapter_title,
      problemId: row.problem_id,
      problemLabel: row.problem_label,
      kind: row.kind,
      difficulty: row.difficulty,
      pageRef: row.page_ref,
      tags: row.tags ? row.tags.split(";").filter(Boolean) : [],
      statement:
        statements.get(`${row.subject_slug}:${row.problem_id}`) ||
        "No problem statement is available yet.",
    });
  }
}

await writeFile(outputPath, `${JSON.stringify({ problems }, null, 2)}\n`, "utf8");
console.log(`Synced ${problems.length} problems.`);
