import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/browser",
    fullyParallel: false,
    workers: 1,
    timeout: 90_000,
    expect: {
        timeout: 10_000,
        toHaveScreenshot: {
            animations: "disabled",
            maxDiffPixelRatio: 0.02,
        },
    },
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: "http://127.0.0.1:4173",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        reducedMotion: "reduce",
    },
    webServer: {
        command: "pnpm --filter @praxbit/web preview --port 4173 --strictPort",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: true,
        timeout: 120_000,
    },
    projects: [
        {
            name: "desktop",
            use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
        },
        {
            name: "tablet",
            use: { ...devices["iPad (gen 7)"], viewport: { width: 834, height: 1112 } },
        },
        {
            name: "mobile",
            use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
        },
    ],
});
