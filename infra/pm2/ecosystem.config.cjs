const path = require("node:path");

// Optional PM2 configuration. PM2 is not required; systemd, supervisord, or
// `pnpm start` in a terminal or tmux are equally supported.
const root = path.resolve(__dirname, "../..");

module.exports = {
    apps: [
        {
            name: "praxbit",
            cwd: root,
            script: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
            args: "start",
            interpreter: "none",
            env: {
                NODE_ENV: "production",
                PRAXBIT_ENV_FILE: path.join(root, ".env"),
            },
            autorestart: true,
            max_restarts: 10,
            min_uptime: "10s",
            restart_delay: 5000,
            kill_timeout: 20000,
            time: true,
        },
    ],
};
