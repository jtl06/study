import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

const MAX_CODE_BYTES = 64 * 1024;
const MAX_BODY_BYTES = 72 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const COLD_COMPILE_TIMEOUT_MS = 120_000;
const WARM_COMPILE_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 5_000;

const testHarness = `
#include <stdio.h>

static int study_lab_passed = 0;
static int study_lab_total = 0;

#define SL_CHECK(condition, label) do { \\
  study_lab_total += 1; \\
  if (condition) { \\
    study_lab_passed += 1; \\
  } else { \\
    printf("FAIL: %s\\n", label); \\
  } \\
} while (0)
`;

const inventory = JSON.parse(
  await readFile(new URL("../public/ostep-labs.json", import.meta.url), "utf8"),
);
const labsByKey = new Map(
  inventory.problems
    .filter((problem) => problem.lab?.runtime === "c")
    .map((problem) => [problem.key, problem.lab]),
);

let compilerIsWarm = false;
let activeCompiles = 0;

function json(response, status, body) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function authorized(request, token) {
  const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = Buffer.from(token);
  const actual = Buffer.from(supplied);
  return (
    expected.length === actual.length &&
    expected.length > 0 &&
    timingSafeEqual(expected, actual)
  );
}

async function readJsonBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function runCommand(command, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        HOME: process.env.WASMER_DIR ?? "/tmp/study-lab-wasmer",
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        WASMER_DIR: process.env.WASMER_DIR ?? "/tmp/study-lab-wasmer",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let outputLimited = false;

    const append = (target, chunk) => {
      const text = chunk.toString("utf8");
      const remaining = Math.max(
        0,
        MAX_OUTPUT_BYTES - Buffer.byteLength(stdout) - Buffer.byteLength(stderr),
      );
      if (remaining === 0) {
        outputLimited = true;
        child.kill("SIGKILL");
        return target;
      }
      return target + Buffer.from(text).subarray(0, remaining).toString("utf8");
    };

    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ code: null, stdout, stderr: error.message, timedOut, outputLimited });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr, timedOut, outputLimited });
    });
  });
}

function presentRun(compileResult, runResult) {
  const combinedOutput = [runResult.stdout.trim(), runResult.stderr.trim()]
    .filter(Boolean)
    .join("\n");
  const marker = combinedOutput.match(/__STUDYLAB_RESULT__\s+(\d+)\s+(\d+)/);
  const passed = marker ? Number(marker[1]) : 0;
  const total = marker ? Number(marker[2]) : 0;
  const visibleOutput = combinedOutput
    .replace(/\n?__STUDYLAB_RESULT__\s+\d+\s+\d+\s*/g, "")
    .trim();
  const checkSummary =
    total > 0
      ? passed === total
        ? `✓ ${passed}/${total} checks passed`
        : `✗ ${passed}/${total} checks passed`
      : `Program exited with code ${runResult.code ?? "unknown"}.`;
  const compilerWarnings = compileResult.stderr.trim();

  return {
    output: [
      compilerWarnings ? `Compiler output\n${compilerWarnings}` : "",
      visibleOutput,
      checkSummary,
      "Runner: Railway sandbox",
    ]
      .filter(Boolean)
      .join("\n\n"),
    passed,
    total,
    succeeded: runResult.code === 0 && total > 0 && passed === total,
    infrastructureFailure: false,
    runner: "railway",
  };
}

export async function compileLabOnRailway(problemKey, code, wasmerPath = "wasmer") {
  const lab = labsByKey.get(problemKey);
  if (!lab) {
    return { status: 404, body: { error: "Unknown C lab." } };
  }
  if (typeof code !== "string" || !code.trim()) {
    return { status: 400, body: { error: "C source is required." } };
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return { status: 413, body: { error: "C source exceeds the 64 KB limit." } };
  }

  const workspace = await mkdtemp(join(tmpdir(), "study-lab-c-"));
  try {
    const sourcePath = join(workspace, "main.c");
    const outputPath = join(workspace, "lab.wasm");
    await writeFile(
      sourcePath,
      `${code.trim()}\n\n${testHarness}\n\n${lab.testCode.trim()}\n`,
      "utf8",
    );

    const compileResult = await runCommand(
      wasmerPath,
      [
        "run",
        "clang/clang",
        `--dir=${workspace}`,
        "--",
        sourcePath,
        "-std=c17",
        "-O0",
        "-Wall",
        "-Wextra",
        "-Werror=implicit-function-declaration",
        "-o",
        outputPath,
      ],
      {
        cwd: workspace,
        timeoutMs: compilerIsWarm ? WARM_COMPILE_TIMEOUT_MS : COLD_COMPILE_TIMEOUT_MS,
      },
    );
    if (!compileResult.timedOut && compileResult.code !== null) {
      compilerIsWarm = true;
    }

    if (compileResult.timedOut) {
      return {
        status: 504,
        body: { error: "Railway compilation timed out.", code: "COMPILE_TIMEOUT" },
      };
    }
    if (compileResult.outputLimited) {
      return {
        status: 413,
        body: { error: "Compiler output exceeded the 64 KB limit." },
      };
    }
    if (compileResult.code !== 0) {
      return {
        status: 200,
        body: {
          output: [
            "Compilation failed",
            compileResult.stderr.trim(),
            compileResult.stdout.trim(),
            "Runner: Railway sandbox",
          ]
            .filter(Boolean)
            .join("\n\n"),
          passed: 0,
          total: 0,
          succeeded: false,
          infrastructureFailure: false,
          runner: "railway",
        },
      };
    }

    const runResult = await runCommand(wasmerPath, ["run", outputPath], {
      cwd: workspace,
      timeoutMs: RUN_TIMEOUT_MS,
    });
    if (runResult.timedOut) {
      return {
        status: 200,
        body: {
          output: "Program timed out after 5 seconds.\n\nRunner: Railway sandbox",
          passed: 0,
          total: lab.checkCount,
          succeeded: false,
          infrastructureFailure: false,
          runner: "railway",
        },
      };
    }
    if (runResult.outputLimited) {
      return {
        status: 200,
        body: {
          output: "Program output exceeded the 64 KB limit.\n\nRunner: Railway sandbox",
          passed: 0,
          total: lab.checkCount,
          succeeded: false,
          infrastructureFailure: false,
          runner: "railway",
        },
      };
    }

    return { status: 200, body: presentRun(compileResult, runResult) };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

export async function startCRunnerService({ port, token, wasmerPath = "wasmer" }) {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (request.method !== "POST" || path !== "/compile") {
      json(response, 404, { error: "Not found" });
      return;
    }
    if (!authorized(request, token)) {
      json(response, 401, { error: "Unauthorized" });
      return;
    }
    if (activeCompiles >= 1) {
      json(response, 429, { error: "The Railway compiler is busy. Try again shortly." });
      return;
    }

    activeCompiles += 1;
    try {
      const body = await readJsonBody(request);
      const result = await compileLabOnRailway(body.problemKey, body.code, wasmerPath);
      json(response, result.status, result.body);
    } catch (error) {
      if (error instanceof Error && error.message === "REQUEST_TOO_LARGE") {
        json(response, 413, { error: "Request exceeds the 72 KB limit." });
      } else if (error instanceof SyntaxError) {
        json(response, 400, { error: "Invalid JSON request." });
      } else {
        console.error("Railway C runner failed:", error);
        json(response, 500, { error: "The Railway C runner failed." });
      }
    } finally {
      activeCompiles -= 1;
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}
