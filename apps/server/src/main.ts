import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import { loadConfiguration, type ServerConfig } from "./config.ts";
import { loadContent } from "./content/loader.ts";
import { initializeDatabase } from "./content/seed.ts";
import { createDatabasePool } from "./db/pool.ts";
import { createApplication } from "./app.ts";

interface Runtime {
    readonly server: ServerType;
    readonly close: () => Promise<void>;
}

function logStartupFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", event: "startup_failed", message }));
}

async function start(config: ServerConfig): Promise<Runtime> {
    const content = await loadContent(config.contentDirectory);
    const pool = createDatabasePool(config);
    try {
        await pool.query("SELECT 1");
        await initializeDatabase(pool, content, config.adminHandles);

        const app = createApplication({ config, pool, content });
        const server = serve({
            fetch: app.fetch,
            hostname: config.host,
            port: config.port,
        });

        const close = async function close(): Promise<void> {
            await new Promise<void>(function wait(resolve, reject) {
                server.close(function closed(error?: Error): void {
                    if (error !== undefined) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
            await pool.end();
        };

        console.info(
            JSON.stringify({
                level: "info",
                event: "server_started",
                host: config.host,
                port: config.port,
                environment: config.nodeEnvironment,
                missions: content.missions.length,
                skills: content.skills.length,
            }),
        );

        return { server, close };
    } catch (error) {
        await pool.end().catch(function ignore(): void {
            return undefined;
        });
        throw error;
    }
}

async function main(): Promise<void> {
    let config: ServerConfig;
    try {
        config = loadConfiguration();
    } catch (error) {
        logStartupFailure(error);
        process.exitCode = 1;
        return;
    }

    let runtime: Runtime;
    try {
        runtime = await start(config);
    } catch (error) {
        logStartupFailure(error);
        process.exitCode = 1;
        return;
    }

    let shuttingDown = false;
    async function shutdown(signal: string): Promise<void> {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        console.info(JSON.stringify({ level: "info", event: "shutdown_started", signal }));
        const timer = setTimeout(function forceExit(): void {
            console.error(JSON.stringify({ level: "error", event: "shutdown_timeout" }));
            process.exit(1);
        }, 10000);
        timer.unref();
        try {
            await runtime.close();
            console.info(JSON.stringify({ level: "info", event: "shutdown_complete" }));
            process.exit(0);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(JSON.stringify({ level: "error", event: "shutdown_failed", message }));
            process.exit(1);
        }
    }

    process.once("SIGTERM", function onSigterm(): void {
        void shutdown("SIGTERM");
    });
    process.once("SIGINT", function onSigint(): void {
        void shutdown("SIGINT");
    });
    process.on("unhandledRejection", function onUnhandled(reason: unknown): void {
        const message = reason instanceof Error ? reason.message : String(reason);
        console.error(JSON.stringify({ level: "error", event: "unhandled_rejection", message }));
    });
}

void main();
