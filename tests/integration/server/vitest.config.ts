import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

export default defineConfig({
    root: repositoryRoot,
    test: {
        include: ["tests/integration/server/**/*.test.ts"],
        environment: "node",
        pool: "forks",
        maxWorkers: 1,
        fileParallelism: false,
        testTimeout: 30000,
        hookTimeout: 60000,
        reporters: ["default"],
    },
    resolve: {
        alias: {
            "@praxbit/contracts": resolve(repositoryRoot, "packages/contracts/src/index.ts"),
            "@praxbit/domain": resolve(repositoryRoot, "packages/domain/src/index.ts"),
            pg: resolve(repositoryRoot, "apps/server/node_modules/pg"),
        },
    },
});
