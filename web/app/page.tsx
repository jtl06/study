"use client";

import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import {
  compileAndRunC,
  compileAndRunCOnRailway,
  type CRunResult,
} from "./c-runner";

type Problem = {
  key: string;
  subjectSlug: string;
  subjectTitle: string;
  source: string;
  chapter: string;
  chapterTitle: string;
  problemId: string;
  problemLabel: string;
  kind: string;
  difficulty: string;
  pageRef: string;
  tags: string[];
  statement: string;
  lab?: LabConfig;
};

type LabConfig = {
  runtime: "c";
  sourceUrl: string;
  homeworkUrl: string;
  goal: string;
  starterCode: string;
  testCode: string;
  checkCount: number;
};

type LabSubmission = {
  version: 2;
  type: "ostep-lab";
  language: "c";
  code: string;
  output: string;
  notes: string;
  passed: number;
  total: number;
  ranAt: string | null;
};

type LabRunState = "idle" | "loading" | "compiling" | "running" | "server";

type StudyStatus = "not-started" | "working" | "review" | "done";
type GradingModel = "gpt-5.6-luna" | "gpt-5.6-sol";

type Solution = {
  subjectSlug: string;
  problemId: string;
  content: string;
  status: StudyStatus;
  updatedAt: string | null;
};

type Grade = {
  subjectSlug: string;
  problemId: string;
  score: number;
  verdict: "done" | "revise";
  summary: string;
  strengths: string[];
  improvements: string[];
  nextStep: string;
  confidence: "low" | "medium" | "high";
  model: string;
  solutionSnapshot: string;
  gradedAt: string;
};

type SolBudget = {
  used: number;
  reserved: number;
  remaining: number;
  limit: number;
  requestCount: number;
  usageDate: string;
  resetsAt: string;
};

type ChapterPractice = {
  chapter: string;
  title: string;
  leetcode: Array<{
    label: string;
    url: string;
  }>;
};

type ProblemGuide = {
  title: string;
  source: string;
  sourceUrl: string;
  content: string;
};

const statusOptions: Array<{ value: StudyStatus; label: string }> = [
  { value: "not-started", label: "Not started" },
  { value: "working", label: "In progress" },
  { value: "review", label: "Needs review" },
  { value: "done", label: "Complete" },
];

const statusLabel = Object.fromEntries(
  statusOptions.map(({ value, label }) => [value, label]),
) as Record<StudyStatus, string>;

const subjectCovers: Record<string, string> = {
  "algorithm-design-manual": "/covers/algorithm-design-manual.jpg",
  "operating-systems-principles-practice":
    "/covers/operating-systems-principles-practice.png",
  "program-proofs": "/covers/program-proofs.jpg",
};

function emptyLabSubmission(lab: LabConfig): LabSubmission {
  return {
    version: 2,
    type: "ostep-lab",
    language: "c",
    code: lab.starterCode,
    output: "",
    notes: "",
    passed: 0,
    total: lab.checkCount,
    ranAt: null,
  };
}

function parseLabSubmission(content: string, lab: LabConfig): LabSubmission {
  try {
    const parsed = JSON.parse(content) as Partial<LabSubmission>;
    if (
      parsed.type === "ostep-lab" &&
      parsed.language === "c" &&
      typeof parsed.code === "string"
    ) {
      return {
        ...emptyLabSubmission(lab),
        ...parsed,
        version: 2,
        type: "ostep-lab",
        language: "c",
      };
    }
    if (parsed.type === "ostep-lab") {
      return {
        ...emptyLabSubmission(lab),
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
      };
    }
  } catch {
    // Older plain-text answers become the reflection instead of being discarded.
  }
  return {
    ...emptyLabSubmission(lab),
    notes: content.trim() ? content : "",
  };
}

function serializeLabSubmission(submission: LabSubmission) {
  return JSON.stringify(submission);
}

function submissionIsAttempted(problem: Problem, answer: string) {
  if (!problem.lab) return Boolean(answer.trim());
  const submission = parseLabSubmission(answer, problem.lab);
  return Boolean(
    submission.output.trim() ||
      submission.notes.trim() ||
      submission.code.trim() !== problem.lab.starterCode.trim(),
  );
}

function graderSubmission(problem: Problem, answer: string) {
  if (!problem.lab) return answer;
  const submission = parseLabSubmission(answer, problem.lab);
  return [
    "Submission type: browser-compiled C17 operating-systems lab",
    `Built-in checks reported: ${submission.passed}/${submission.total}`,
    "",
    "## Student code",
    "```c",
    submission.code,
    "```",
    "",
    "## Captured browser output",
    "```text",
    submission.output || "(The student has not run the lab.)",
    "```",
    "",
    "## Student reflection",
    submission.notes || "(No reflection supplied.)",
  ].join("\n");
}

function solutionKey(subjectSlug: string, problemId: string) {
  return `${subjectSlug}:${problemId}`;
}

function difficultyLabel(value: string) {
  if (!value) return "Unrated";
  const number = Number(value);
  if (number <= 3) return "Warm-up";
  if (number === 4) return "Medium";
  return "Challenge";
}

function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`markdown ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default function Home() {
  const [problems, setProblems] = useState<Problem[]>([]);
  const [chapterPractice, setChapterPractice] = useState<ChapterPractice[]>([]);
  const [guides, setGuides] = useState<Record<string, ProblemGuide>>({});
  const [solutions, setSolutions] = useState<Record<string, Solution>>({});
  const [selectedKey, setSelectedKey] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [chapterFilter, setChapterFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<StudyStatus>("not-started");
  const [loadedKey, setLoadedKey] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [view, setView] = useState<"write" | "preview">("write");
  const [referenceOpenKey, setReferenceOpenKey] = useState("");
  const [indentWidth, setIndentWidth] = useState<2 | 4>(2);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [gradeState, setGradeState] = useState<"idle" | "grading" | "error">(
    "idle",
  );
  const [gradeError, setGradeError] = useState("");
  const [gradeModel, setGradeModel] = useState<GradingModel>("gpt-5.6-luna");
  const [solBudget, setSolBudget] = useState<SolBudget | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    completed: number;
    total: number;
  } | null>(null);
  const [labRunState, setLabRunState] = useState<LabRunState>("idle");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/problems.json").then((response) => response.json()),
      fetch("/ostep-labs.json").then((response) => response.json()),
      fetch("/chapter-practice.json").then((response) => response.json()),
      fetch("/problem-guides.json").then((response) => response.json()),
      fetch("/api/solutions").then((response) => {
        if (!response.ok) throw new Error("Could not open the study database.");
        return response.json();
      }),
    ])
      .then(([problemData, ostepData, practiceData, guideData, solutionData]) => {
        if (cancelled) return;
        const nextProblems = [
          ...(problemData.problems as Problem[]),
          ...(ostepData.problems as Problem[]),
        ];
        const problemKeys = new Set(nextProblems.map((problem) => problem.key));
        const nextSolutions = Object.fromEntries(
          (solutionData.solutions as Solution[])
            .filter((solution) =>
              problemKeys.has(solutionKey(solution.subjectSlug, solution.problemId)),
            )
            .map((solution) => [
              solutionKey(solution.subjectSlug, solution.problemId),
              solution,
            ]),
        );
        setProblems(nextProblems);
        setChapterPractice(practiceData.chapters as ChapterPractice[]);
        setGuides(guideData as Record<string, ProblemGuide>);
        setSolutions(nextSolutions);
        setSelectedKey(nextProblems[0]?.key ?? "");
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Could not load Study Lab.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    problems.forEach((problem) => map.set(problem.subjectSlug, problem.subjectTitle));
    return [...map.entries()].map(([slug, title]) => ({ slug, title }));
  }, [problems]);

  const chapters = useMemo(() => {
    const map = new Map<string, string>();
    problems
      .filter(
        (problem) => subjectFilter === "all" || problem.subjectSlug === subjectFilter,
      )
      .forEach((problem) =>
        map.set(
          `${problem.subjectSlug}:${problem.chapter}`,
          `Ch. ${Number(problem.chapter)} · ${problem.chapterTitle}`,
        ),
      );
    return [...map.entries()].map(([key, title]) => ({ key, title }));
  }, [problems, subjectFilter]);

  useEffect(() => {
    if (chapterFilter === "all") return;
    if (!chapters.some((chapter) => chapter.key === chapterFilter)) {
      setChapterFilter("all");
    }
  }, [chapterFilter, chapters]);

  const filteredProblems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return problems.filter((problem) => {
      const savedStatus = solutions[problem.key]?.status ?? "not-started";
      const chapterKey = `${problem.subjectSlug}:${problem.chapter}`;
      const searchable = [
        problem.problemId,
        problem.problemLabel,
        problem.statement,
        problem.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return (
        (subjectFilter === "all" || problem.subjectSlug === subjectFilter) &&
        (chapterFilter === "all" || chapterKey === chapterFilter) &&
        (statusFilter === "all" || savedStatus === statusFilter) &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
  }, [chapterFilter, problems, query, solutions, statusFilter, subjectFilter]);

  const currentProblem = useMemo(
    () => problems.find((problem) => problem.key === selectedKey) ?? null,
    [problems, selectedKey],
  );
  const currentLab = currentProblem?.lab ?? null;
  const labSubmission = useMemo(
    () => (currentLab ? parseLabSubmission(content, currentLab) : null),
    [content, currentLab],
  );

  const currentGuide = currentProblem ? guides[currentProblem.key] ?? null : null;
  const statementView =
    currentProblem?.key && referenceOpenKey === currentProblem.key
      ? "reference"
      : "problem";

  const activeChapterPractice = useMemo(() => {
    if (subjectFilter !== "algorithm-design-manual") return null;
    const chapter =
      chapterFilter !== "all"
        ? chapterFilter.split(":")[1]
        : currentProblem?.subjectSlug === "algorithm-design-manual"
          ? currentProblem.chapter
          : "01";
    return chapterPractice.find((entry) => entry.chapter === chapter) ?? null;
  }, [chapterFilter, chapterPractice, currentProblem, subjectFilter]);

  function flushCurrentSolution() {
    if (!dirty || !currentProblem) return;
    const problem = currentProblem;
    const snapshot = { content, status };
    setSaveState("saving");
    void fetch("/api/solutions", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subjectSlug: problem.subjectSlug,
        problemId: problem.problemId,
        content: snapshot.content,
        status: snapshot.status,
      }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Save failed");
        return response.json();
      })
      .then(({ solution }: { solution: Solution }) => {
        setSolutions((previous) => ({ ...previous, [problem.key]: solution }));
        setSaveState("saved");
      })
      .catch(() => setSaveState("error"));
  }

  function chooseProblem(key: string) {
    if (key === selectedKey) return;
    flushCurrentSolution();
    setSelectedKey(key);
  }

  useEffect(() => {
    if (!filteredProblems.length) return;
    if (!filteredProblems.some((problem) => problem.key === selectedKey)) {
      flushCurrentSolution();
      setSelectedKey(filteredProblems[0].key);
    }
    // Selection changes are intentionally driven only by the filtered result set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredProblems, selectedKey]);

  useEffect(() => {
    if (!currentProblem) return;
    const controller = new AbortController();
    const key = currentProblem.key;
    setLoadedKey("");
    setContent("");
    setStatus("not-started");
    setDirty(false);
    setSaveState("saved");
    setGradeState("idle");
    setGradeError("");
    setGrade(null);
    setLabRunState("idle");

    Promise.all([
      fetch(
        `/api/solutions?subjectSlug=${encodeURIComponent(currentProblem.subjectSlug)}&problemId=${encodeURIComponent(currentProblem.problemId)}`,
        { signal: controller.signal },
      ).then((response) => {
        if (!response.ok) throw new Error("Could not load this solution.");
        return response.json() as Promise<{ solution: Solution }>;
      }),
      fetch(
        `/api/grade?subjectSlug=${encodeURIComponent(currentProblem.subjectSlug)}&problemId=${encodeURIComponent(currentProblem.problemId)}`,
        { signal: controller.signal },
      ).then((response) => {
        if (!response.ok) throw new Error("Could not load grading feedback.");
        return response.json() as Promise<{
          grade: Grade | null;
          solBudget: SolBudget;
        }>;
      }),
    ])
      .then(([solutionData, gradeData]) => {
        setContent(solutionData.solution.content);
        setStatus(solutionData.solution.status);
        setGrade(gradeData.grade);
        setSolBudget(gradeData.solBudget);
        setDirty(false);
        setLoadedKey(key);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSaveState("error");
      });

    return () => controller.abort();
  }, [currentProblem]);

  useEffect(() => {
    if (!dirty || !currentProblem || loadedKey !== currentProblem.key) return;
    setSaveState("saving");
    const key = currentProblem.key;
    const timeout = window.setTimeout(() => {
      fetch("/api/solutions", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectSlug: currentProblem.subjectSlug,
          problemId: currentProblem.problemId,
          content,
          status,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Save failed");
          return response.json();
        })
        .then(({ solution }: { solution: Solution }) => {
          setSolutions((previous) => ({ ...previous, [key]: solution }));
          setDirty(false);
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [content, currentProblem, dirty, loadedKey, status]);

  const doneCount = Object.values(solutions).filter(
    (solution) => solution.status === "done",
  ).length;
  const activeCount = Object.values(solutions).filter(
    (solution) => solution.status === "working" || solution.status === "review",
  ).length;
  const progress = problems.length ? Math.round((doneCount / problems.length) * 100) : 0;
  const gradeIsStale = Boolean(
    grade && grade.solutionSnapshot.trim() !== content.trim(),
  );
  const solBudgetPercent = solBudget
    ? Math.min(100, Math.round((solBudget.used / solBudget.limit) * 100))
    : 0;
  const attemptedCount = problems.filter((problem) => {
    const answer =
      problem.key === currentProblem?.key
        ? content
        : solutions[problem.key]?.content ?? "";
    return submissionIsAttempted(problem, answer);
  }).length;
  const gradingPercent = batchProgress
    ? Math.round((batchProgress.completed / batchProgress.total) * 100)
    : null;

  function changeContent(value: string) {
    setContent(value);
    setDirty(true);
  }

  function handleTextareaTab(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    value: string,
    onChange: (nextValue: string) => void,
  ) {
    if (event.key !== "Tab") return;
    event.preventDefault();

    const textarea = event.currentTarget;
    const cursor = textarea.selectionStart;
    const indentation = " ".repeat(indentWidth);
    const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;

    if (event.shiftKey) {
      const linePrefix = value.slice(lineStart, cursor);
      const spacesToRemove = Math.min(indentWidth, (linePrefix.match(/^ */) ?? [""])[0].length);
      if (!spacesToRemove) return;
      onChange(
        `${value.slice(0, lineStart)}${value.slice(lineStart + spacesToRemove)}`,
      );
      window.requestAnimationFrame(() => {
        const nextCursor = Math.max(lineStart, cursor - spacesToRemove);
        textarea.selectionStart = nextCursor;
        textarea.selectionEnd = nextCursor;
      });
      return;
    }

    onChange(`${value.slice(0, cursor)}${indentation}${value.slice(cursor)}`);
    window.requestAnimationFrame(() => {
      textarea.selectionStart = cursor + indentWidth;
      textarea.selectionEnd = cursor + indentWidth;
    });
  }

  function handleEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    handleTextareaTab(event, content, changeContent);
  }

  function updateLabSubmission(patch: Partial<LabSubmission>) {
    if (!labSubmission) return;
    changeContent(serializeLabSubmission({ ...labSubmission, ...patch }));
  }

  async function runCurrentLab(forceRailway = false) {
    if (!currentProblem || !currentLab || !labSubmission || labRunState !== "idle") return;
    let result: CRunResult;

    if (forceRailway) {
      setLabRunState("server");
      try {
        result = await compileAndRunCOnRailway(
          currentProblem.key,
          labSubmission.code,
        );
      } catch (error) {
        result = {
          output: [
            "Railway runner unavailable",
            error instanceof Error ? error.message : String(error),
          ].join("\n\n"),
          passed: 0,
          total: currentLab.checkCount,
          succeeded: false,
          infrastructureFailure: true,
          runner: "railway",
        };
      }
    } else {
      setLabRunState("loading");
      result = await compileAndRunC(
        labSubmission.code,
        currentLab.testCode,
        setLabRunState,
      );
      if (result.infrastructureFailure) {
        setLabRunState("server");
        try {
          result = await compileAndRunCOnRailway(
            currentProblem.key,
            labSubmission.code,
          );
        } catch (error) {
          result = {
            output: [
              result.output,
              "Railway fallback unavailable",
              error instanceof Error ? error.message : String(error),
            ].join("\n\n"),
            passed: 0,
            total: currentLab.checkCount,
            succeeded: false,
            infrastructureFailure: true,
            runner: "railway",
          };
        }
      }
    }
    updateLabSubmission({
      output: result.output,
      passed: result.passed,
      total: result.total || currentLab.checkCount,
      ranAt: new Date().toISOString(),
    });
    setLabRunState("idle");
  }

  function changeStatus(value: StudyStatus) {
    setStatus(value);
    setDirty(true);
  }

  function selectNextProblem() {
    if (!currentProblem || !filteredProblems.length) return;
    const index = filteredProblems.findIndex((problem) => problem.key === currentProblem.key);
    const next = filteredProblems[(index + 1) % filteredProblems.length];
    chooseProblem(next.key);
  }

  async function requestGrade(problem: Problem, answer: string) {
    const formattedAnswer = graderSubmission(problem, answer);
    const response = await fetch("/api/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectSlug: problem.subjectSlug,
          subjectTitle: problem.subjectTitle,
          chapterTitle: problem.chapterTitle,
          problemId: problem.problemId,
          problemLabel: problem.problemLabel,
          kind: problem.kind,
          difficulty: problem.difficulty,
          statement: problem.statement,
          solution: formattedAnswer,
          solutionSnapshot: answer,
          model: gradeModel,
        }),
      });
    let data: {
      grade?: Grade;
      error?: string;
      solBudget?: SolBudget;
    };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new Error(
        `The grading service returned an invalid response (HTTP ${response.status}).`,
      );
    }
    if (data.solBudget) setSolBudget(data.solBudget);
    if (!response.ok || !data.grade) {
      throw new Error(data.error || "The grader could not evaluate this answer.");
    }
    return data.grade;
  }

  async function saveGradedSolution(
    problem: Problem,
    answer: string,
    nextGrade: Grade,
  ) {
    const nextStatus: StudyStatus = nextGrade.verdict === "done" ? "done" : "review";
    const saveResponse = await fetch("/api/solutions", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectSlug: problem.subjectSlug,
          problemId: problem.problemId,
          content: answer,
          status: nextStatus,
        }),
      });
    if (!saveResponse.ok) {
      throw new Error("Feedback was saved, but status update failed.");
    }
    const saveData = (await saveResponse.json()) as { solution: Solution };
    return saveData.solution;
  }

  async function gradeCurrentProblem() {
    if (
      !currentProblem ||
      !submissionIsAttempted(currentProblem, content) ||
      gradeState === "grading" ||
      batchProgress
    ) {
      return;
    }
    setGradeState("grading");
    setGradeError("");

    try {
      const nextGrade = await requestGrade(currentProblem, content);
      const savedSolution = await saveGradedSolution(
        currentProblem,
        content,
        nextGrade,
      );
      setGrade(nextGrade);
      setStatus(savedSolution.status);
      setSolutions((previous) => ({
        ...previous,
        [currentProblem.key]: savedSolution,
      }));
      setDirty(false);
      setSaveState("saved");
      setGradeState("idle");
    } catch (error) {
      setGradeError(
        error instanceof Error ? error.message : "The grader could not evaluate this answer.",
      );
      setGradeState("error");
    }
  }

  async function gradeAllAttempted() {
    if (batchProgress || gradeState === "grading") return;
    const queue = problems
      .map((problem) => ({
        problem,
        answer:
          problem.key === currentProblem?.key
            ? content
            : solutions[problem.key]?.content ?? "",
      }))
      .filter(({ problem, answer }) => submissionIsAttempted(problem, answer));

    if (!queue.length) {
      setGradeError("There are no attempted problems to grade yet.");
      setGradeState("error");
      return;
    }

    setGradeError("");
    setGradeState("idle");
    setBatchProgress({ current: 1, completed: 0, total: queue.length });

    try {
      for (let index = 0; index < queue.length; index += 1) {
        const { problem, answer } = queue[index];
        setBatchProgress({
          current: index + 1,
          completed: index,
          total: queue.length,
        });
        const nextGrade = await requestGrade(problem, answer);
        const savedSolution = await saveGradedSolution(problem, answer, nextGrade);
        setSolutions((previous) => ({
          ...previous,
          [problem.key]: savedSolution,
        }));

        if (problem.key === currentProblem?.key) {
          setGrade(nextGrade);
          setStatus(savedSolution.status);
          setDirty(false);
          setSaveState("saved");
        }

        setBatchProgress({
          current: Math.min(index + 2, queue.length),
          completed: index + 1,
          total: queue.length,
        });
      }
      setBatchProgress(null);
    } catch (error) {
      setGradeError(
        error instanceof Error
          ? error.message
          : "Batch grading stopped before all answers were graded.",
      );
      setGradeState("error");
      setBatchProgress(null);
    }
  }

  if (loading) {
    return (
      <main className="center-state">
        <div className="brand-mark">SL</div>
        <p>Opening your study workspace…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="center-state">
        <div className="brand-mark">SL</div>
        <h1>Study Lab could not open</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-mark">SL</div>
          <div>
            <strong>Study Lab</strong>
            <span>Deliberate practice</span>
          </div>
        </header>

        <section className="progress-card">
          <div className="progress-heading">
            <span>Overall progress</span>
            <strong>{progress}%</strong>
          </div>
          <div className="progress-track" aria-label={`${progress}% complete`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <div className="stat-row">
            <div>
              <strong>{doneCount}</strong>
              <span>Complete</span>
            </div>
            <div>
              <strong>{activeCount}</strong>
              <span>Active</span>
            </div>
            <div>
              <strong>{problems.length}</strong>
              <span>Total</span>
            </div>
          </div>
        </section>

        <nav className="subject-nav" aria-label="Study areas">
          <button
            className={subjectFilter === "all" ? "active" : ""}
            onClick={() => setSubjectFilter("all")}
          >
            <span className="subject-icon all">∞</span>
            <span>All study areas</span>
            <small>{problems.length}</small>
          </button>
          {subjects.map((subject) => {
            const count = problems.filter(
              (problem) => problem.subjectSlug === subject.slug,
            ).length;
            return (
              <button
                key={subject.slug}
                className={subjectFilter === subject.slug ? "active" : ""}
                onClick={() => setSubjectFilter(subject.slug)}
              >
                {subjectCovers[subject.slug] ? (
                  <span className="subject-icon cover">
                    <img src={subjectCovers[subject.slug]} alt="" />
                  </span>
                ) : (
                  <span className="subject-icon cover ostep-cover" aria-hidden="true">
                    OS
                  </span>
                )}
                <span>{subject.title}</span>
                <small>{count}</small>
              </button>
            );
          })}
        </nav>

        <footer className="sidebar-footer">
          <span className="status-light" />
          Saved to the cloud as you work
        </footer>
      </aside>

      <section className="problem-browser">
        <header className="browser-header">
          <div>
            <p className="eyebrow">Problem library</p>
            <h1>{filteredProblems.length} problems</h1>
          </div>
          <label className="search-box">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search problems"
              aria-label="Search problems"
            />
          </label>
          <div className="filters">
            <select
              value={chapterFilter}
              onChange={(event) => setChapterFilter(event.target.value)}
              aria-label="Filter by chapter"
            >
              <option value="all">All chapters</option>
              {chapters.map((chapter) => (
                <option key={chapter.key} value={chapter.key}>
                  {chapter.title}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        {activeChapterPractice && (
          <aside className="leetcode-practice" aria-label="LeetCode chapter practice">
            <div>
              <span>LeetCode · Chapter {Number(activeChapterPractice.chapter)}</span>
              <strong>{activeChapterPractice.title}</strong>
            </div>
            <div className="leetcode-links">
              {activeChapterPractice.leetcode.map((problem) => (
                <a
                  key={problem.url}
                  href={problem.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {problem.label} <span aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          </aside>
        )}

        <div className="problem-list" data-testid="problem-list">
          {filteredProblems.map((problem) => {
            const problemStatus = solutions[problem.key]?.status ?? "not-started";
            return (
              <button
                key={problem.key}
                className={`problem-row ${problem.key === selectedKey ? "selected" : ""}`}
                onClick={() => chooseProblem(problem.key)}
                data-problem-key={problem.key}
              >
                <span className={`status-dot ${problemStatus}`} />
                <span className="problem-copy">
                  <span className="problem-id">
                    {problem.problemId}
                    <small>{problem.kind}</small>
                  </span>
                  <strong>{problem.problemLabel}</strong>
                  <span className="problem-meta">
                    Chapter {Number(problem.chapter)} · {difficultyLabel(problem.difficulty)}
                  </span>
                </span>
              </button>
            );
          })}
          {!filteredProblems.length && (
            <div className="empty-list">
              <strong>No problems found</strong>
              <span>Try clearing a filter or using a broader search.</span>
            </div>
          )}
        </div>
      </section>

      <section className="workspace">
        {currentProblem ? (
          <>
            <header className="workspace-header">
              <div>
                <p className="eyebrow">
                  {currentProblem.subjectTitle} · Chapter {Number(currentProblem.chapter)}
                </p>
                <h2>
                  <span>{currentProblem.problemId}</span>
                  {currentProblem.problemLabel}
                </h2>
              </div>
              <div className="workspace-actions">
                <span className={`save-state ${saveState}`}>
                  {saveState === "saving"
                    ? "Saving…"
                    : saveState === "error"
                      ? "Save failed"
                      : "Saved"}
                </span>
                <select
                  value={status}
                  onChange={(event) => changeStatus(event.target.value as StudyStatus)}
                  aria-label="Problem status"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="grader-model">
                  <select
                    value={gradeModel}
                    onChange={(event) =>
                      setGradeModel(event.target.value as GradingModel)
                    }
                    aria-label="Grading model"
                  >
                    <option value="gpt-5.6-luna">Luna · High</option>
                    <option value="gpt-5.6-sol">Sol · High</option>
                  </select>
                  {gradeModel === "gpt-5.6-sol" && solBudget && (
                    <small>{solBudget.remaining.toLocaleString()} tokens left today</small>
                  )}
                </div>
                <button
                  className="grade-button"
                  onClick={gradeCurrentProblem}
                  disabled={
                    !submissionIsAttempted(currentProblem, content) ||
                    gradeState === "grading" ||
                    Boolean(batchProgress) ||
                    (gradeModel === "gpt-5.6-sol" && solBudget?.remaining === 0)
                  }
                  title={`Grade with ${gradeModel} using high reasoning effort`}
                >
                  {gradeState === "grading"
                    ? "Grading…"
                    : "Grade current"}
                </button>
                <button
                  className="batch-grade-button"
                  onClick={gradeAllAttempted}
                  disabled={
                    attemptedCount === 0 ||
                    gradeState === "grading" ||
                    Boolean(batchProgress) ||
                    (gradeModel === "gpt-5.6-sol" && solBudget?.remaining === 0)
                  }
                  title={`Grade every attempted problem with ${gradeModel}`}
                >
                  {batchProgress
                    ? `Grading ${batchProgress.current}/${batchProgress.total}`
                    : `Grade all (${attemptedCount})`}
                </button>
                <button className="next-button" onClick={selectNextProblem}>
                  Next problem <span>→</span>
                </button>
              </div>
            </header>

            {(gradeState === "grading" || batchProgress) && (
              <section className="grading-progress" role="status" aria-live="polite">
                <div className="grading-progress-copy">
                  <span className="grading-pulse" aria-hidden="true" />
                  <strong>
                    {batchProgress
                      ? `Grading answer ${batchProgress.current} of ${batchProgress.total}`
                      : "Grading current answer"}
                  </strong>
                  <span>
                    {batchProgress
                      ? `${gradingPercent}% complete`
                      : `${gradeModel === "gpt-5.6-sol" ? "Sol" : "Luna"} · High reasoning`}
                  </span>
                </div>
                <div
                  className={`grading-progress-track ${batchProgress ? "determinate" : "indeterminate"}`}
                  role="progressbar"
                  aria-label="AI grading progress"
                  aria-valuemin={batchProgress ? 0 : undefined}
                  aria-valuemax={batchProgress ? 100 : undefined}
                  aria-valuenow={gradingPercent ?? undefined}
                  aria-valuetext={
                    batchProgress
                      ? `${batchProgress.completed} of ${batchProgress.total} answers graded`
                      : "Grading in progress"
                  }
                >
                  <span
                    style={
                      batchProgress ? { width: `${gradingPercent}%` } : undefined
                    }
                  />
                </div>
              </section>
            )}

            {gradeModel === "gpt-5.6-sol" && solBudget && (
              <section className="sol-budget-card sol-budget-top">
                <div className="sol-budget-heading">
                  <div>
                    <strong>Sol daily cap</strong>
                    <span>Resets at 00:00 UTC</span>
                  </div>
                  <p>
                    <strong>{solBudget.used.toLocaleString()}</strong>
                    <span> / {solBudget.limit.toLocaleString()} tokens</span>
                  </p>
                </div>
                <div className="sol-budget-track" aria-label={`${solBudgetPercent}% used`}>
                  <span style={{ width: `${solBudgetPercent}%` }} />
                </div>
                <small>
                  This guard tracks Sol grading done in Study Lab. OpenAI’s complimentary
                  allowance is shared with other eligible model usage in your organization.
                </small>
              </section>
            )}

            <div className="workspace-scroll">
              <article className="statement-card">
                <div className="card-heading">
                  <div className="statement-tabs" role="tablist" aria-label="Problem materials">
                    <button
                      className={statementView === "problem" ? "active" : ""}
                      onClick={() => setReferenceOpenKey("")}
                      role="tab"
                      aria-selected={statementView === "problem"}
                    >
                      Problem statement
                    </button>
                    {currentGuide && (
                      <button
                        className={statementView === "reference" ? "active" : ""}
                        onClick={() => setReferenceOpenKey(currentProblem.key)}
                        role="tab"
                        aria-selected={statementView === "reference"}
                      >
                        Reference heuristics
                      </button>
                    )}
                  </div>
                  <small>{currentProblem.pageRef}</small>
                </div>
                {statementView === "reference" && currentGuide ? (
                  <div className="reference-panel">
                    <div className="reference-kicker">Extracted study guide</div>
                    <h3>{currentGuide.title}</h3>
                    <p className="reference-source">
                      Source: {currentGuide.source}{" "}
                      <a href={currentGuide.sourceUrl} target="_blank" rel="noreferrer">
                        View source ↗
                      </a>
                    </p>
                    <Markdown className="problem-copy">{currentGuide.content}</Markdown>
                  </div>
                ) : (
                  <>
                    <Markdown className="problem-copy">{currentProblem.statement}</Markdown>
                    {currentLab && (
                      <div className="ostep-source-strip">
                        <div>
                          <span>OSTEP companion overlay</span>
                          <strong>{currentLab.goal}</strong>
                        </div>
                        <div>
                          <a href={currentLab.sourceUrl} target="_blank" rel="noreferrer">
                            Read chapter ↗
                          </a>
                          <a href={currentLab.homeworkUrl} target="_blank" rel="noreferrer">
                            Official simulators ↗
                          </a>
                          <a
                            href="https://github.com/remzi-arpacidusseau/ostep-projects"
                            target="_blank"
                            rel="noreferrer"
                          >
                            Advanced projects ↗
                          </a>
                        </div>
                      </div>
                    )}
                    {!!currentProblem.tags.length && (
                      <div className="tag-row">
                        {currentProblem.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </article>

              {currentLab && labSubmission ? (
                <section className="lab-card" aria-label="Browser programming lab">
                  <header className="lab-toolbar">
                    <div>
                      <span className="runtime-dot" aria-hidden="true" />
                      <div>
                        <strong>Compile & run online</strong>
                        <small>C17 · Clang/WASI · browser first, Railway fallback</small>
                      </div>
                    </div>
                    <div className="lab-actions">
                      <label htmlFor="lab-indent-width">Indent</label>
                      <select
                        id="lab-indent-width"
                        value={indentWidth}
                        onChange={(event) =>
                          setIndentWidth(Number(event.target.value) as 2 | 4)
                        }
                        aria-label="Lab indent width"
                      >
                        <option value="2">2 spaces</option>
                        <option value="4">4 spaces</option>
                      </select>
                      <button
                        className="lab-reset-button"
                        onClick={() =>
                          updateLabSubmission({
                            ...emptyLabSubmission(currentLab),
                            notes: labSubmission.notes,
                          })
                        }
                        disabled={labRunState !== "idle"}
                      >
                        Reset code
                      </button>
                      <button
                        className="lab-run-button"
                        onClick={() => runCurrentLab(false)}
                        disabled={labRunState !== "idle"}
                      >
                        {labRunState === "loading"
                          ? "Loading Clang…"
                          : labRunState === "compiling"
                            ? "Compiling…"
                            : labRunState === "running"
                              ? "Running…"
                              : labRunState === "server"
                                ? "Running on Railway…"
                              : "▶ Compile & run"}
                      </button>
                      <button
                        className="lab-reset-button"
                        onClick={() => runCurrentLab(true)}
                        disabled={labRunState !== "idle"}
                        title="Skip the browser compiler and run in Railway's WebAssembly sandbox"
                      >
                        Run on Railway
                      </button>
                    </div>
                  </header>

                  <div className="lab-grid">
                    <div className="lab-pane code-pane">
                      <div className="lab-pane-heading">
                        <span>main.c</span>
                        <small>Tab inserts {indentWidth} spaces</small>
                      </div>
                      <textarea
                        value={labSubmission.code}
                        onChange={(event) =>
                          updateLabSubmission({
                            code: event.target.value,
                            output: "",
                            passed: 0,
                            ranAt: null,
                          })
                        }
                        onKeyDown={(event) =>
                          handleTextareaTab(
                            event,
                            labSubmission.code,
                            (code) =>
                              updateLabSubmission({
                                code,
                                output: "",
                                passed: 0,
                                ranAt: null,
                              }),
                          )
                        }
                        aria-label="Lab code editor"
                        spellCheck={false}
                        wrap="off"
                      />
                    </div>
                    <div className="lab-pane output-pane">
                      <div className="lab-pane-heading">
                        <span>Output</span>
                        <small>
                          {labSubmission.ranAt
                            ? `${labSubmission.passed}/${labSubmission.total} checks`
                            : `${currentLab.checkCount} hidden checks`}
                        </small>
                      </div>
                      <pre
                        className={
                          labSubmission.ranAt &&
                          labSubmission.passed === labSubmission.total
                            ? "passed"
                            : ""
                        }
                        aria-live="polite"
                      >
                        {labRunState !== "idle"
                          ? labRunState === "loading"
                            ? "Loading the browser Clang toolchain…\nThe first download may take a minute."
                            : labRunState === "compiling"
                              ? "Compiling main.c with Clang…"
                              : labRunState === "running"
                                ? "Running the compiled WebAssembly program…"
                                : "Browser compiler unavailable.\nCompiling in the Railway WebAssembly sandbox…"
                          : labSubmission.output ||
                            "Compile the C program and run the checks. The browser runs it locally when possible; Railway takes over automatically if the browser toolchain is unavailable."}
                      </pre>
                    </div>
                  </div>

                  <div className="lab-reflection">
                    <div>
                      <strong>Explain your result</strong>
                      <span>
                        Sol grades the code, captured output, and your reasoning together.
                      </span>
                    </div>
                    <textarea
                      value={labSubmission.notes}
                      onChange={(event) =>
                        updateLabSubmission({ notes: event.target.value })
                      }
                      onKeyDown={(event) =>
                        handleTextareaTab(
                          event,
                          labSubmission.notes,
                          (notes) => updateLabSubmission({ notes }),
                        )
                      }
                      placeholder="Explain the operating-systems idea, edge cases, and what the run demonstrates…"
                      aria-label="Lab reflection"
                      spellCheck
                    />
                  </div>
                </section>
              ) : (
                <section className="solution-card">
                  <div className="editor-toolbar">
                    <div>
                      <button
                        className={view === "write" ? "active" : ""}
                        onClick={() => setView("write")}
                      >
                        Write
                      </button>
                      <button
                        className={view === "preview" ? "active" : ""}
                        onClick={() => setView("preview")}
                      >
                        Preview
                      </button>
                    </div>
                    <div className="editor-tools">
                      <label htmlFor="indent-width">Indent</label>
                      <select
                        id="indent-width"
                        value={indentWidth}
                        onChange={(event) =>
                          setIndentWidth(Number(event.target.value) as 2 | 4)
                        }
                        aria-label="Indent width"
                      >
                        <option value="2">2 spaces</option>
                        <option value="4">4 spaces</option>
                      </select>
                      <span>Markdown + LaTeX</span>
                    </div>
                  </div>
                  {view === "write" ? (
                    <textarea
                      value={content}
                      onChange={(event) => changeContent(event.target.value)}
                      onKeyDown={handleEditorKeyDown}
                      placeholder={
                        "Start with the core idea. Then make the argument precise…\n\n## Approach\n\n## Verification\n"
                      }
                      aria-label="Solution editor"
                      spellCheck
                    />
                  ) : (
                    <div className="solution-preview">
                      {content.trim() ? (
                        <Markdown>{content}</Markdown>
                      ) : (
                        <p className="preview-empty">
                          Your rendered solution will appear here.
                        </p>
                      )}
                    </div>
                  )}
                </section>
              )}

              {gradeError && (
                <div className="grade-error" role="alert">
                  <strong>Grading unavailable</strong>
                  <span>{gradeError}</span>
                </div>
              )}

              {grade && (
                <section className={`grade-card ${grade.verdict}`}>
                  <header className="grade-header">
                    <div className="grade-score">
                      <strong>{grade.score}</strong>
                      <span>/ 10</span>
                    </div>
                    <div className="grade-title">
                      <p className="eyebrow">
                        {grade.model === "gpt-5.6-sol" ? "GPT-5.6 Sol" : "GPT-5.6 Luna"}
                        {" · High reasoning"}
                      </p>
                      <h3>
                        {grade.verdict === "done" ? "Ready to move on" : "Revise this answer"}
                      </h3>
                    </div>
                    <span className={`grade-verdict ${grade.verdict}`}>
                      {grade.verdict === "done" ? "Complete" : "Needs review"}
                    </span>
                  </header>

                  {gradeIsStale && (
                    <div className="stale-grade">
                      This feedback is for an older draft. Grade again when you are ready.
                    </div>
                  )}

                  <Markdown className="grade-summary">{grade.summary}</Markdown>

                  <div className="feedback-columns">
                    <div>
                      <h4>What works</h4>
                      {grade.strengths.length ? (
                        <ul>
                          {grade.strengths.map((item) => (
                            <li key={item}>
                              <Markdown>{item}</Markdown>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No specific strengths were identified yet.</p>
                      )}
                    </div>
                    <div>
                      <h4>What to improve</h4>
                      {grade.improvements.length ? (
                        <ul>
                          {grade.improvements.map((item) => (
                            <li key={item}>
                              <Markdown>{item}</Markdown>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No material revisions are needed.</p>
                      )}
                    </div>
                  </div>

                  <div className="next-step">
                    <span>Next step</span>
                    <Markdown>{grade.nextStep}</Markdown>
                  </div>
                  <footer className="grade-footer">
                    AI set this problem to <strong>{statusLabel[status]}</strong>. You can
                    override that decision using the status menu above.
                  </footer>
                </section>
              )}
            </div>
          </>
        ) : (
          <div className="workspace-empty">Select a problem to begin.</div>
        )}
      </section>
    </main>
  );
}
