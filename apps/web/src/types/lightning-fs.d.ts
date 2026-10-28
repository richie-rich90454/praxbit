declare module "@isomorphic-git/lightning-fs" {
    interface Promises {
        readFile(path: string, options?: { encoding?: string } | string): Promise<Uint8Array | string>;
        writeFile(path: string, data: Uint8Array | string, options?: { encoding?: string } | string): Promise<void>;
        mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
        readdir(path: string): Promise<string[]>;
        stat(path: string): Promise<{ isDirectory(): boolean; mode: number }>;
        unlink(path: string): Promise<void>;
        rmdir(path: string): Promise<void>;
        rename(oldPath: string, newPath: string): Promise<void>;
    }

    export default class LightningFS {
        public readonly promises: Promises;
        public constructor(name: string, options?: { wipe?: boolean });
    }
}
