import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { WorldState, WorldSystem, WorldSystemId } from "@praxbit/contracts";

const POSITIONS: Readonly<Record<WorldSystemId, { x: number; y: number }>> = {
    storefront: { x: 40, y: 40 },
    website: { x: 240, y: 40 },
    api: { x: 440, y: 40 },
    database: { x: 640, y: 40 },
    messaging: { x: 40, y: 220 },
    delivery: { x: 240, y: 220 },
    "dev-team": { x: 440, y: 220 },
    "server-room": { x: 640, y: 220 },
    robotics: { x: 240, y: 400 },
};

const STATUS_COLORS = {
    healthy: "#236A50",
    degraded: "#926300",
    down: "#B42318",
    offline: "#555555",
} as const;

function statusText(system: WorldSystem): string {
    return system.status === "healthy"
        ? "Healthy"
        : system.status === "degraded"
          ? "Degraded"
          : system.status === "down"
            ? "Down"
            : "Offline";
}

export class CampusRenderer {
    private readonly app: Application;
    private readonly container: HTMLElement;
    private readonly onSelect: (systemId: WorldSystemId) => void;
    private readonly scene: Container;
    private readonly width: number;

    private constructor(app: Application, container: HTMLElement, onSelect: (systemId: WorldSystemId) => void, width: number) {
        this.app = app;
        this.container = container;
        this.onSelect = onSelect;
        this.width = width;
        this.scene = new Container();
        this.app.stage.addChild(this.scene);
    }

    public static async create(
        container: HTMLElement,
        onSelect: (systemId: WorldSystemId) => void,
    ): Promise<CampusRenderer> {
        const width = Math.max(360, container.clientWidth || 960);
        const app = new Application();
        await app.init({
            width,
            height: 520,
            background: "#FFFFFF",
            antialias: true,
            resolution: Math.min(2, window.devicePixelRatio || 1),
            autoDensity: true,
        });
        app.canvas.setAttribute("aria-hidden", "true");
        container.replaceChildren(app.canvas);
        const renderer = new CampusRenderer(app, container, onSelect, width);
        return renderer;
    }

    public update(state: WorldState): void {
        this.scene.removeChildren();
        const scale = Math.min(1.6, Math.max(0.7, this.width / 840));
        const offsetX = Math.max(0, (this.width - 840 * scale) / 2);

        const edges = new Graphics();
        for (const [from, to] of state.edges) {
            const start = POSITIONS[from];
            const end = POSITIONS[to];
            if (start === undefined || end === undefined) {
                continue;
            }
            edges
                .moveTo(offsetX + (start.x + 80) * scale, (start.y + 32) * scale)
                .lineTo(offsetX + (end.x + 80) * scale, (end.y + 32) * scale)
                .stroke({ width: 1, color: "#D6D6D6" });
        }
        this.scene.addChild(edges);

        const onSelect = this.onSelect;
        for (const system of state.systems) {
            const position = POSITIONS[system.id];
            if (position === undefined) {
                continue;
            }
            const x = offsetX + position.x * scale;
            const y = position.y * scale;
            const width = 168 * scale;
            const height = 76 * scale;
            const color = STATUS_COLORS[system.status];

            const node = new Graphics();
            node
                .roundRect(x, y, width, height, 5)
                .fill({ color: "#FFFFFF" })
                .stroke({ width: 1.5, color });
            node.eventMode = "static";
            node.cursor = "pointer";
            node.on("pointertap", function selected(): void {
                onSelect(system.id);
            });
            this.scene.addChild(node);

            const title = new Text({
                text: system.name,
                style: new TextStyle({
                    fontFamily: "Noto Sans, sans-serif",
                    fontSize: Math.round(13 * scale),
                    fontWeight: "700",
                    fill: "#000000",
                    wordWrap: true,
                    wordWrapWidth: width - 20,
                }),
            });
            title.x = x + 10;
            title.y = y + 10;
            this.scene.addChild(title);

            const status = new Text({
                text: statusText(system),
                style: new TextStyle({
                    fontFamily: "Noto Sans, sans-serif",
                    fontSize: Math.round(11 * scale),
                    fill: color,
                }),
            });
            status.x = x + 10;
            status.y = y + 50 * scale;
            this.scene.addChild(status);
        }
    }

    public destroy(): void {
        this.scene.removeChildren();
        this.app.destroy(true, { children: true });
        this.container.replaceChildren();
    }
}

export async function mountCampusWorld(
    container: HTMLElement,
    state: WorldState,
    onSelect: (systemId: WorldSystemId) => void,
): Promise<CampusRenderer> {
    const renderer = await CampusRenderer.create(container, onSelect);
    renderer.update(state);
    return renderer;
}
