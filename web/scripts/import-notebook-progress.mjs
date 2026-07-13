import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const webRoot = resolve(new URL("..", import.meta.url).pathname);
const generatedRoot = resolve(webRoot, "../notebooks/generated");
const apiUrl = process.env.STUDY_LAB_URL || "http://localhost:3000";
const placeholder = "Write the main reasoning, proof, notes, or solution attempt here.";
const imported = [];

for (const subjectSlug of await readdir(generatedRoot)) {
  const subjectDir = resolve(generatedRoot, subjectSlug);
  const notebookFiles = (await readdir(subjectDir)).filter((name) => name.endsWith(".ipynb"));

  for (const notebookFile of notebookFiles) {
    const notebook = JSON.parse(await readFile(resolve(subjectDir, notebookFile), "utf8"));
    let currentProblemId = "";
    let waitingForAnswer = false;

    for (const cell of notebook.cells ?? []) {
      const source = (cell.source ?? []).join("").trim();
      const heading = source.match(/^##\s+([^:]+):/);
      if (cell.cell_type === "markdown" && heading) {
        currentProblemId = heading[1].trim();
        waitingForAnswer = true;
        continue;
      }

      if (!waitingForAnswer || cell.cell_type !== "markdown") continue;
      waitingForAnswer = false;
      if (!source || source === placeholder) continue;

      imported.push({
        subjectSlug,
        problemId: currentProblemId,
        content: source,
        status: "working",
      });
    }
  }
}

for (const solution of imported) {
  const response = await fetch(`${apiUrl}/api/solutions`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(solution),
  });
  if (!response.ok) {
    throw new Error(`Could not import ${solution.subjectSlug}:${solution.problemId}`);
  }
}

console.log(`Imported ${imported.length} notebook answers.`);
