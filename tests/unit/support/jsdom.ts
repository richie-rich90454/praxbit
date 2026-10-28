import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export interface PreviewOutcome {
    readonly description: string;
    readonly passed: boolean;
    readonly actual?: string;
    readonly error?: string;
}

interface PreviewListener {
    (event: { readonly data?: unknown }): void;
}

interface DomWindow {
    addEventListener(type: string, listener: PreviewListener): void;
    postMessage(message: unknown, targetOrigin: string): void;
    close(): void;
}

export interface DomLike {
    readonly window: DomWindow;
}

interface JsdomConstructor {
    new (html: string, options: Readonly<Record<string, unknown>>): DomLike;
}

interface JsdomModule {
    readonly JSDOM: JsdomConstructor;
}

const validatorRequire = createRequire(
    fileURLToPath(new URL("../../../packages/content-validator/package.json", import.meta.url)),
);
const jsdom = validatorRequire("jsdom") as JsdomModule;

export function domFrom(html: string): DomLike {
    return new jsdom.JSDOM(html, {
        runScripts: "dangerously",
        pretendToBeVisual: true,
        url: "https://praxbit.test/",
    });
}
