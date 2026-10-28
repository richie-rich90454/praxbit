import type {
    WorldAction,
    WorldLogEntry,
    WorldState,
    WorldSystem,
    WorldSystemId,
} from "@praxbit/contracts";

function system(
    id: WorldSystemId,
    name: string,
    kind: WorldSystem["kind"],
    status: WorldSystem["status"],
    summary: string,
    dependsOn: readonly WorldSystemId[],
    metrics: Readonly<Record<string, number>>,
): WorldSystem {
    return { id, name, kind, status, summary, dependsOn: [...dependsOn], metrics: { ...metrics } };
}

export function createInitialWorld(): WorldState {
    return {
        id: "campus",
        version: 0,
        systems: [
            system(
                "storefront",
                "Campus storefront",
                "frontend",
                "degraded",
                "Orders arrive, but the page has no reliable structure.",
                ["api"],
                {
                    pageViews: 240,
                    brokenLinks: 3,
                },
            ),
            system(
                "website",
                "Campus website",
                "frontend",
                "healthy",
                "The public information pages are served correctly.",
                ["api"],
                {
                    pageViews: 610,
                },
            ),
            system(
                "api",
                "Orders API",
                "service",
                "healthy",
                "Accepts orders and passes them to the database.",
                ["database"],
                {
                    requestsPerMinute: 42,
                    errorRate: 0,
                },
            ),
            system(
                "database",
                "Inventory database",
                "data",
                "healthy",
                "Stores stock, orders, and audit records.",
                [],
                {
                    rows: 1840,
                    slowQueries: 0,
                },
            ),
            system(
                "messaging",
                "Campus messaging",
                "network",
                "degraded",
                "Delivery notifications are delayed on one route.",
                [],
                {
                    queuedMessages: 18,
                },
            ),
            system(
                "delivery",
                "Delivery dispatch",
                "service",
                "healthy",
                "Assigns orders to the campus courier queue.",
                ["api", "messaging"],
                {
                    openDeliveries: 7,
                },
            ),
            system(
                "dev-team",
                "Campus development team",
                "people",
                "healthy",
                "Maintains the storefront and reviews changes.",
                [],
                {
                    openReviews: 2,
                },
            ),
            system(
                "server-room",
                "Server room",
                "infrastructure",
                "healthy",
                "Runs the services behind the campus.",
                ["api", "database"],
                {
                    cpuPercent: 31,
                },
            ),
            system(
                "robotics",
                "Robotics lab",
                "automation",
                "offline",
                "Waits for a valid binary control message.",
                ["messaging", "server-room"],
                {
                    powered: 0,
                },
            ),
        ],
        edges: [
            ["storefront", "api"],
            ["website", "api"],
            ["api", "database"],
            ["delivery", "api"],
            ["delivery", "messaging"],
            ["server-room", "api"],
            ["server-room", "database"],
            ["robotics", "messaging"],
            ["robotics", "server-room"],
        ],
        flags: {
            inventoryConsistent: false,
            storefrontPublished: false,
            deploymentRestored: false,
            permissionsFixed: false,
            mergeResolved: false,
            systemsIntegrated: false,
            incidentResolved: false,
            roboticsEnabled: false,
            serviceHardened: false,
            serviceRestarted: false,
        },
        log: [],
    };
}

interface ActionEffect {
    readonly message: string;
    readonly flags: readonly string[];
    readonly statuses: Readonly<
        Partial<Record<WorldSystemId, WorldState["systems"][number]["status"]>>
    >;
    readonly metrics?: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

function effectFor(action: WorldAction, state: WorldState): ActionEffect {
    switch (action.id) {
        case "repair-inventory":
            return {
                message: "Inventory rules now reject impossible orders and preserve valid ones.",
                flags: ["inventoryConsistent"],
                statuses: { storefront: "healthy", database: "healthy" },
                metrics: {
                    database: { rows: 1840, slowQueries: 0 },
                    storefront: { brokenLinks: 0 },
                },
            };
        case "publish-storefront":
            return {
                message: "The storefront structure and layout are published to the campus website.",
                flags: ["storefrontPublished"],
                statuses: { storefront: "healthy", website: "healthy" },
                metrics: { storefront: { brokenLinks: 0 } },
            };
        case "restore-deploy":
            return {
                message: "A known-good release is serving traffic again.",
                flags: ["deploymentRestored"],
                statuses: { "server-room": "healthy", api: "healthy", "dev-team": "healthy" },
                metrics: { api: { errorRate: 0 } },
            };
        case "fix-permissions":
            return {
                message: "File permissions are corrected without granting broad access.",
                flags: ["permissionsFixed"],
                statuses: { "server-room": "healthy" },
            };
        case "restart-service": {
            const target = action.systemId ?? "api";
            return {
                message: `The ${target} service restarts and reports ready.`,
                flags: ["serviceRestarted"],
                statuses: { [target]: "healthy" },
            };
        }
        case "resolve-merge":
            return {
                message: "The conflicting branches are merged with both intentions preserved.",
                flags: ["mergeResolved"],
                statuses: { "dev-team": "healthy" },
            };
        case "integrate-systems":
            return {
                message: "The storefront, API, and database agree on the order contract.",
                flags: ["systemsIntegrated"],
                statuses: { api: "healthy", database: "healthy", messaging: "healthy" },
                metrics: { api: { errorRate: 0 } },
            };
        case "resolve-incident": {
            const ready =
                state.flags["systemsIntegrated"] === true &&
                state.flags["deploymentRestored"] === true &&
                state.flags["storefrontPublished"] === true;
            const last = state.log[state.log.length - 1];
            return {
                message: ready
                    ? "The campus incident is resolved. Every system has a verified recovery step."
                    : "The incident is contained, but unresolved prerequisites keep two systems degraded.",
                flags: ready ? ["incidentResolved"] : [],
                statuses: ready
                    ? {
                          api: "healthy",
                          database: "healthy",
                          messaging: "healthy",
                          storefront: "healthy",
                          website: "healthy",
                          delivery: "healthy",
                          "dev-team": "healthy",
                          "server-room": "healthy",
                          robotics: state.flags["roboticsEnabled"] === true ? "healthy" : "offline",
                      }
                    : { api: "degraded", messaging: "degraded" },
                metrics:
                    last === undefined
                        ? { api: { errorRate: 0.12 } }
                        : { api: { errorRate: 0.12 } },
            };
        }
        case "enable-robotics":
            return {
                message: "The robotics lab decodes its first valid control message.",
                flags: ["roboticsEnabled"],
                statuses: { robotics: "healthy" },
                metrics: { robotics: { powered: 1 } },
            };
        case "secure-service":
            return {
                message:
                    "The service now rejects malformed and unauthorized requests before processing.",
                flags: ["serviceHardened"],
                statuses: { api: "healthy" },
            };
        default:
            return {
                message: "No system change was recorded.",
                flags: [],
                statuses: {},
            };
    }
}

export interface WorldActionResult {
    readonly state: WorldState;
    readonly changed: boolean;
}

export function applyWorldAction(state: WorldState, action: WorldAction): WorldActionResult {
    const effect = effectFor(action, state);
    const nextVersion = state.version + 1;
    const flags = new Set<string>(
        Object.keys(state.flags).filter(function enabled(key: string): boolean {
            return state.flags[key] === true;
        }),
    );
    for (const flag of effect.flags) {
        flags.add(flag);
    }

    const systems = state.systems.map(function update(
        current: WorldState["systems"][number],
    ): WorldState["systems"][number] {
        const status = effect.statuses[current.id];
        const metrics = effect.metrics?.[current.id];
        if (status === undefined && metrics === undefined) {
            return { ...current, metrics: { ...current.metrics } };
        }
        return {
            ...current,
            status: status ?? current.status,
            metrics:
                metrics === undefined ? { ...current.metrics } : { ...current.metrics, ...metrics },
        };
    });

    const allFlags: Record<string, boolean> = {};
    for (const key of Object.keys(state.flags)) {
        allFlags[key] = flags.has(key);
    }
    const logEntry: WorldLogEntry = { seq: nextVersion, action: action.id, text: effect.message };
    const log = [...state.log, logEntry].slice(-100);

    return {
        state: { ...state, version: nextVersion, systems, flags: allFlags, log },
        changed: true,
    };
}

export function worldHealth(state: WorldState): {
    readonly healthy: number;
    readonly total: number;
    readonly recovery: number;
} {
    let healthy = 0;
    for (const item of state.systems) {
        if (item.status === "healthy") {
            healthy += 1;
        }
    }
    return {
        healthy,
        total: state.systems.length,
        recovery: state.systems.length === 0 ? 0 : healthy / state.systems.length,
    };
}

export function isWorldRecovered(state: WorldState): boolean {
    return state.systems.every(function healthy(item: WorldState["systems"][number]): boolean {
        return item.status === "healthy";
    });
}
