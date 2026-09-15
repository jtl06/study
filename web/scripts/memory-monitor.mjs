import { readFile } from "node:fs/promises";

// cgroup usage includes Wrangler, workerd, compiler children, and file cache.
// Node RSS is only a fallback; it must never be presented as container usage.
export async function readMemory() {
  for (const [source, path] of [
    ["cgroup-v2", "/sys/fs/cgroup/memory.current"],
    ["cgroup-v1", "/sys/fs/cgroup/memory/memory.usage_in_bytes"],
  ]) {
    try {
      const bytes = Number((await readFile(path, "utf8")).trim());
      if (Number.isFinite(bytes) && bytes >= 0) return { source, bytes };
    } catch { /* Local development may have no cgroup filesystem. */ }
  }
  return { source: "node-process-only", bytes: process.memoryUsage().rss };
}

export async function measureMemory(operation, action, { intervalMs = 250, emit = console.log } = {}) {
  const before = await readMemory();
  let peakBytes = before.bytes;
  let samples = 1;
  let pending = Promise.resolve();
  let sampling = false;
  const started = performance.now();
  const timer = setInterval(() => {
    if (sampling) return;
    sampling = true;
    pending = readMemory().then((sample) => {
      peakBytes = Math.max(peakBytes, sample.bytes);
      samples += 1;
    }).finally(() => { sampling = false; });
  }, intervalMs);
  timer.unref();
  let completed = false;
  try {
    const result = await action();
    completed = true;
    return result;
  } finally {
    clearInterval(timer);
    await pending;
    const after = await readMemory();
    emit(JSON.stringify({
      event: "study_lab_memory", operation, completed,
      timestamp: new Date().toISOString(), source: before.source,
      durationMs: Math.round(performance.now() - started), samples: samples + 1,
      beforeBytes: before.bytes, afterBytes: after.bytes,
      peakBytes: Math.max(peakBytes, after.bytes),
      retainedBytes: after.bytes - before.bytes,
    }));
  }
}
