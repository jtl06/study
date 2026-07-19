import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("syncs the repository problem inventories", async () => {
  const [data, ostep, practice] = await Promise.all([
    readFile(new URL("public/problems.json", root), "utf8").then(JSON.parse),
    readFile(new URL("public/ostep-labs.json", root), "utf8").then(JSON.parse),
    readFile(new URL("public/chapter-practice.json", root), "utf8").then(JSON.parse),
  ]);

  assert.equal(data.problems.length, 76);
  assert.ok(data.problems.every((problem) => problem.key));
  assert.ok(data.problems.every((problem) => problem.statement));
  assert.ok(
    data.problems.some(
      (problem) =>
        problem.subjectSlug === "algorithm-design-manual" &&
        problem.problemId === "1-6",
    ),
  );
  const bubbleSort = data.problems.find(
    (problem) =>
      problem.subjectSlug === "algorithm-design-manual" && problem.problemId === "1-10",
  );
  assert.match(bubbleSort.statement, /```text\nBUBBLESORT\(A\)/);
  assert.match(bubbleSort.statement, /\n\s+for j from 1 to i - 1/);
  const algorithmProblems = data.problems.filter(
    (problem) => problem.subjectSlug === "algorithm-design-manual",
  );
  assert.equal(algorithmProblems.length, 60);
  assert.equal(new Set(algorithmProblems.map((problem) => problem.chapter)).size, 12);
  const coreCounts = algorithmProblems.reduce((counts, problem) => {
    counts.set(problem.chapter, (counts.get(problem.chapter) ?? 0) + 1);
    return counts;
  }, new Map());
  assert.ok([...coreCounts.values()].every((count) => count === 5));
  assert.equal(practice.chapters.length, 12);
  assert.ok(practice.chapters.every((chapter) => chapter.leetcode.length >= 3));
  assert.ok(
    practice.chapters.every((chapter) =>
      chapter.leetcode.every((problem) => problem.url.startsWith("https://leetcode.com/")),
    ),
  );
  assert.equal(ostep.problems.length, 12);
  assert.equal(new Set(ostep.problems.map((problem) => problem.chapter)).size, 3);
  assert.ok(
    ostep.problems.every(
      (problem) =>
        problem.subjectSlug === "operating-systems-three-easy-pieces" &&
        problem.lab.runtime === "javascript" &&
        problem.lab.sourceUrl.startsWith("https://pages.cs.wisc.edu/~remzi/OSTEP/") &&
        problem.lab.checkCount > 0,
    ),
  );
});

test("uses the finished Study Lab interface", async () => {
  const [page, layout, grader, viteConfig, proxy, railwayConfig] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
    readFile(new URL("app/api/grade/route.ts", root), "utf8"),
    readFile(new URL("vite.config.ts", root), "utf8"),
    readFile(new URL("proxy.ts", root), "utf8"),
    readFile(new URL("railway.json", root), "utf8"),
  ]);

  assert.match(layout, /title:\s*"Study Lab"/);
  assert.match(page, /Problem library/);
  assert.match(page, /Solution editor/);
  assert.match(page, /Markdown \+ LaTeX/);
  assert.match(page, /Grade current/);
  assert.match(page, /Grade all/);
  assert.match(page, /AI grading progress/);
  assert.match(page, /Grading answer/);
  assert.match(page, /LeetCode chapter practice/);
  assert.match(page, /covers\/algorithm-design-manual\.jpg/);
  assert.match(page, /covers\/operating-systems-principles-practice\.png/);
  assert.match(page, /covers\/program-proofs\.jpg/);
  assert.match(page, /Sol daily cap/);
  assert.match(page, /Compile & run online/);
  assert.match(page, /isolated browser worker/);
  assert.match(page, /Official simulators/);
  assert.match(page, /runJavascriptLab/);
  assert.match(page, /solutionSnapshot: answer/);
  assert.match(page, /Ready to move on/);
  assert.match(page, /<Markdown className="grade-summary">\{grade\.summary\}<\/Markdown>/);
  assert.match(page, /<Markdown>\{grade\.nextStep\}<\/Markdown>/);
  assert.match(page, /<span>\/ 10<\/span>/);
  assert.doesNotMatch(page, /<span>\/ 100<\/span>/);
  assert.match(grader, /gpt-5\.6-luna/);
  assert.match(grader, /gpt-5\.6-sol/);
  assert.match(grader, /SOL_DAILY_TOKEN_CAP = 250_000/);
  assert.match(grader, /responses\/input_tokens/);
  assert.match(grader, /REASONING_EFFORT = "high"/);
  assert.match(grader, /type: "json_schema"/);
  assert.match(grader, /maximum: 10/);
  assert.match(grader, /HOURLY_GRADING_LIMIT = 30/);
  assert.match(grader, /GRADING_RATE_LIMIT/);
  assert.match(grader, /browser programming labs/);
  assert.match(grader, /solutionSnapshot/);
  assert.match(viteConfig, /command === "serve"/);
  assert.match(proxy, /Study Lab authentication required/);
  assert.equal(JSON.parse(railwayConfig).deploy.healthcheckPath, "/api/health");
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});
