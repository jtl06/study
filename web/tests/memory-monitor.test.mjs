import { test } from "node:test";
import assert from "node:assert/strict";
import { measureMemory, readMemory } from "../scripts/memory-monitor.mjs";

test("memory sample identifies its scope and uses bytes", async () => {
  const sample = await readMemory();
  assert.ok(["cgroup-v2", "cgroup-v1", "node-process-only"].includes(sample.source));
  assert.ok(Number.isFinite(sample.bytes) && sample.bytes > 0);
});
test("measurement preserves return values and records failures without swallowing them", async () => {
  const records = [];
  const options = { emit: (line) => records.push(JSON.parse(line)) };
  assert.equal(await measureMemory("success", async () => 42, options), 42);
  await assert.rejects(measureMemory("failure", async () => { throw new Error("expected"); }, options), /expected/);
  assert.equal(records[0].completed, true);
  assert.equal(records[1].completed, false);
  for (const record of records) {
    assert.ok(record.peakBytes >= record.beforeBytes && record.peakBytes >= record.afterBytes);
    assert.equal(record.retainedBytes, record.afterBytes - record.beforeBytes);
  }
});
