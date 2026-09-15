# Memory measurements

Production logs emit `study_lab_memory` records around OpenAI proxy calls and C compilation/execution. Values are bytes. `source=cgroup-v2` or `cgroup-v1` measures the entire container, including child processes and file cache. `node-process-only` is a development fallback and excludes children. Peaks are sampled every 250 ms and may miss shorter spikes. Overlapping requests share the same container measurements; these are not per-request allocation counts.

The grading hook covers the outbound API call and response buffering, not the complete database/save pipeline. No prompts, answers, credentials, or response content are logged. There is no idle sampler or outgoing metrics service.

## Repeatable workload

Run from `/app` inside the running Railway container using its SSH terminal. Run when nobody is using Study Lab; the direct compiler workload is intended for an isolated measurement session.

```sh
MEMORY_GRADE_COMMAND='node scripts/memory-workload.mjs grading' \
MEMORY_COMPILE_COMMAND='node scripts/memory-workload.mjs compilation' \
npm run memory:harness
```

This measures 30 seconds idle, a real Sol request through the production proxy, a real compiler/test run, then 30 seconds idle. The grading fixture uses API tokens and bypasses the app's daily cap/accounting, but does not save or overwrite any student grade. Its token total is printed. Use ordinary site grading with the production hooks when app budget accounting is required.

Run several cycles to compare first-use caches with warm behavior. `MEMORY_IDLE_MS=60000` allows more settling time. `MEMORY_MAX_RETAINED_MB=128` optionally fails the run when final memory exceeds the settled baseline by more than 128 MiB; choose a threshold after establishing normal warm behavior. Remaining memory alone does not prove a leak. File cache and runtime caches may stay allocated.

Commands have a 180-second timeout and failed commands fail the harness. Override via `MEMORY_COMMAND_TIMEOUT_MS`. The harness refuses to claim container measurements on macOS. To smoke-test only the orchestration locally:

```sh
MEMORY_ALLOW_PROCESS_ONLY=1 MEMORY_IDLE_MS=50 \
MEMORY_GRADE_COMMAND='node -e "0"' MEMORY_COMPILE_COMMAND='node -e "0"' \
npm run memory:harness
```

These local no-op commands do not exercise grading or compilation and cannot provide production RAM conclusions.
