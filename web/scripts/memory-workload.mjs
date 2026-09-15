import { readFile } from "node:fs/promises";
import { compileLabOnRailway } from "./c-runner-service.mjs";

if (process.argv[2] === "grading") {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required");
  // Exercise the production grading proxy without creating a saved student grade.
  const response = await fetch("http://127.0.0.1:8790/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-sol", reasoning: { effort: "high" }, max_output_tokens: 2400,
      input: "Grade this algorithm answer from 0 to 10 with concise feedback. Question: Explain binary search correctness and complexity. Answer: Maintain a half-open interval containing every possible match. Compare the middle element and discard the half that cannot contain the target because the input is sorted. Each step shortens the interval; an empty interval means no match. Time O(log n), auxiliary space O(1)." }),
  });
  const result = await response.json();
  if (!response.ok || result.status !== "completed") throw new Error(`Grading workload failed: HTTP ${response.status}, status ${result.status ?? "unknown"}`);
  console.log(JSON.stringify({ workload: "grading", totalTokens: result.usage?.total_tokens }));
} else if (process.argv[2] === "compilation") {
  const inventory = JSON.parse(await readFile(new URL("../public/ostep-labs.json", import.meta.url), "utf8"));
  const lab = inventory.problems[0];
  const result = await compileLabOnRailway(lab.key, lab.lab.starterCode);
  // Starter code intentionally fails checks, but must compile and execute.
  if (result.status !== 200 || result.body.total !== lab.lab.checkCount || result.body.infrastructureFailure) {
    throw new Error("Compilation workload did not compile and execute the test harness");
  }
  console.log(JSON.stringify({ workload: "compilation", checksExecuted: result.body.total }));
} else throw new Error("Expected grading or compilation");
