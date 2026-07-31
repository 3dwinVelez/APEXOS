const test = require("node:test");
const assert = require("node:assert/strict");
const { currentPerformanceContext, measurePhase, runPerformanceContext } = require("../src/core/performanceContext");

test("performance context accumulates named phases without leaking between requests", async () => {
  await new Promise((resolve, reject) => {
    runPerformanceContext({ startedAt: process.hrtime.bigint() }, async () => {
      try {
        await measurePhase("authentication", async () => new Promise((done) => setTimeout(done, 5)));
        await measurePhase("authentication", async () => undefined);
        assert.ok(currentPerformanceContext().phases.authentication >= 4);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
  assert.equal(currentPerformanceContext(), null);
});
