import { describe, it } from "vitest";

// The learner JavaScript runtime is a browser Worker built by Vite. It has no
// Node entry point, so this suite records the gap explicitly instead of
// pretending to execute it. The validator runs reference solutions in
// node:vm for trusted content only; that is not a test of the browser worker.
describe.skip("browser JavaScript worker (requires a real Worker runtime)", function browserWorker(): void {
    it("executes learner code inside an isolated worker", function isolatedWorker(): void {
        throw new Error("Requires a real Worker runtime; the web end-to-end suite must cover it.");
    });
});
