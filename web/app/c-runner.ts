import type { Directory, Wasmer } from "@wasmer/sdk";

export type CRunPhase = "loading" | "compiling" | "running";

export type CRunResult = {
  output: string;
  passed: number;
  total: number;
  succeeded: boolean;
  infrastructureFailure: boolean;
  runner: "browser" | "railway";
};

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

let sdkPromise: Promise<typeof import("@wasmer/sdk")> | null = null;
let compilerPromise: Promise<Wasmer> | null = null;

async function getSDK() {
  sdkPromise ??= import("@wasmer/sdk");
  return sdkPromise;
}

async function getCompiler() {
  if (!compilerPromise) {
    compilerPromise = (async () => {
      const { Wasmer, init } = await getSDK();
      await init({ log: "error" });
      return Wasmer.fromRegistry("clang/clang");
    })();
  }
  return compilerPromise;
}

export async function compileAndRunC(
  code: string,
  tests: string,
  onPhase: (phase: CRunPhase) => void,
): Promise<CRunResult> {
  let project: Directory | null = null;

  try {
    onPhase("loading");
    const { Directory, Wasmer } = await getSDK();
    const compiler = await getCompiler();
    project = new Directory();
    const entrypoint = compiler.entrypoint;
    if (!entrypoint) throw new Error("The browser Clang package has no entrypoint.");

    await project.writeFile(
      "main.c",
      `${code.trim()}\n\n${testHarness}\n\n${tests.trim()}\n`,
    );

    onPhase("compiling");
    const compilation = await entrypoint.run({
      args: [
        "/project/main.c",
        "-std=c17",
        "-O0",
        "-Wall",
        "-Wextra",
        "-Werror=implicit-function-declaration",
        "-o",
        "/project/lab.wasm",
      ],
      mount: { "/project": project },
    });
    const compileOutput = await compilation.wait();

    if (!compileOutput.ok) {
      return {
        output: [
          "Compilation failed",
          compileOutput.stderr.trim(),
          compileOutput.stdout.trim(),
        ]
          .filter(Boolean)
          .join("\n\n"),
        passed: 0,
        total: 0,
        succeeded: false,
        infrastructureFailure: false,
        runner: "browser",
      };
    }

    const wasm = await project.readFile("lab.wasm");
    const program = await Wasmer.fromFile(wasm);
    const programEntrypoint = program.entrypoint;
    if (!programEntrypoint) throw new Error("Clang produced a program with no entrypoint.");

    onPhase("running");
    const instance = await programEntrypoint.run();
    const runOutput = await instance.wait();
    const combinedOutput = [runOutput.stdout.trim(), runOutput.stderr.trim()]
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
        : `Program exited with code ${runOutput.code}.`;
    const compilerWarnings = compileOutput.stderr.trim();

    return {
      output: [
        compilerWarnings ? `Compiler output\n${compilerWarnings}` : "",
        visibleOutput,
        checkSummary,
      ]
        .filter(Boolean)
        .join("\n\n"),
      passed,
      total,
      succeeded: runOutput.ok && total > 0 && passed === total,
      infrastructureFailure: false,
      runner: "browser",
    };
  } catch (error) {
    compilerPromise = null;
    return {
      output: `C toolchain error\n${
        error instanceof Error ? error.message : String(error)
      }`,
      passed: 0,
      total: 0,
      succeeded: false,
      infrastructureFailure: true,
      runner: "browser",
    };
  } finally {
    project?.free();
  }
}

export async function compileAndRunCOnRailway(
  problemKey: string,
  code: string,
): Promise<CRunResult> {
  const response = await fetch("/api/labs/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ problemKey, code }),
  });
  let data: Partial<CRunResult> & { error?: string };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    throw new Error(`Railway returned an invalid response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(data.error || `Railway compilation failed (HTTP ${response.status}).`);
  }
  return {
    output: data.output ?? "Railway returned no output.",
    passed: data.passed ?? 0,
    total: data.total ?? 0,
    succeeded: data.succeeded ?? false,
    infrastructureFailure: data.infrastructureFailure ?? false,
    runner: "railway",
  };
}
