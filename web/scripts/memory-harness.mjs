import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { measureMemory, readMemory } from "./memory-monitor.mjs";

// Commands are explicitly supplied by the operator, never read from submissions.
const grade = process.env.MEMORY_GRADE_COMMAND;
const compile = process.env.MEMORY_COMPILE_COMMAND;
if (!grade || !compile) throw new Error("Set MEMORY_GRADE_COMMAND and MEMORY_COMPILE_COMMAND to workload commands.");
const idleMs = Number(process.env.MEMORY_IDLE_MS ?? 30000);
const timeoutMs = Number(process.env.MEMORY_COMMAND_TIMEOUT_MS ?? 180000);
if (!Number.isFinite(idleMs) || idleMs < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error("Invalid idle duration or command timeout.");
}
const initial = await readMemory();
if (initial.source === "node-process-only" && process.env.MEMORY_ALLOW_PROCESS_ONLY !== "1") {
  throw new Error("Run inside the application's Linux container to measure all processes. For a harness smoke test only, set MEMORY_ALLOW_PROCESS_ONLY=1.");
}
const records = [];
const options = { emit: (line) => { records.push(JSON.parse(line)); console.log(line); } };
async function command(value) {
  await new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", ["-c", value], { stdio: "inherit", detached: true });
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ }
      reject(new Error("Workload timed out"));
    }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`Workload exited with code ${code}`));
    });
  });
}
await measureMemory("idle_before", () => delay(idleMs), options);
await measureMemory("grading", () => command(grade), options);
await measureMemory("compilation", () => command(compile), options);
await measureMemory("idle_after", () => delay(idleMs), options);
const retainedBytes = records.at(-1).afterBytes - records[0].afterBytes;
console.log(JSON.stringify({ event: "study_lab_memory_summary", source: initial.source,
  peakBytes: Math.max(...records.map((r) => r.peakBytes)), retainedBytes,
  idleBeforeBytes: records[0].afterBytes, idleAfterBytes: records.at(-1).afterBytes,
  note: "Sampled peaks can miss short spikes. Retained memory may include caches; one cycle does not establish a leak." }));
if (process.env.MEMORY_MAX_RETAINED_MB !== undefined) {
  const limit = Number(process.env.MEMORY_MAX_RETAINED_MB);
  if (!Number.isFinite(limit) || limit < 0) throw new Error("Invalid retained-memory limit");
  if (retainedBytes > limit * 1024 * 1024) process.exitCode = 1;
}
