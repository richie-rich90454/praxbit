/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module "*.wasm?url" {
    const source: string;
    export default source;
}
