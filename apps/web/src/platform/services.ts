import { PraxbitDatabase, ApiClient, SyncManager } from "@praxbit/client";

export const db = new PraxbitDatabase();
export const api = new ApiClient();
export const syncManager = new SyncManager(api, db);
