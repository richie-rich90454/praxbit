import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "dev.praxbit.app",
    appName: "Praxbit",
    webDir: "dist",
    server: {
        androidScheme: "https",
    },
    plugins: {
        Preferences: {
            group: "PraxbitSession",
        },
    },
};

export default config;
