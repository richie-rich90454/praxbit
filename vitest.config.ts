import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            {
                test: {
                    name: "unit",
                    include: ["tests/unit/**/*.test.ts", "apps/companion/test/**/*.test.ts"],
                    environment: "node",
                    timeout: 10_000,
                },
            },
            {
                test: {
                    name: "content",
                    include: ["tests/content/**/*.test.ts"],
                    environment: "node",
                    timeout: 30_000,
                },
            },
            {
                test: {
                    name: "security",
                    include: ["tests/security/**/*.test.ts"],
                    environment: "node",
                    timeout: 30_000,
                },
            },
            {
                test: {
                    name: "integration",
                    include: ["tests/integration/**/*.test.ts"],
                    environment: "node",
                    timeout: 60_000,
                    hookTimeout: 120_000,
                    fileParallelism: false,
                    pool: "forks",
                    poolOptions: {
                        forks: { singleFork: true },
                    },
                },
            },
        ],
    },
});
