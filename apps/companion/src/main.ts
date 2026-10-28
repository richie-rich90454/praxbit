import { runCli } from "./cli.ts";

void runCli(process.argv.slice(2)).then(
    function finish(exitCode: number): void {
        process.exitCode = exitCode;
    },
    function fail(error: unknown): void {
        process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    },
);
