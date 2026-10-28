export interface RateLimitDecision {
    readonly allowed: boolean;
    readonly remaining: number;
    readonly retryAfterSeconds: number;
}

interface Bucket {
    readonly timestamps: number[];
}

const MAXIMUM_BUCKETS = 10000;

export class RateLimiter {
    private readonly buckets: Map<string, Bucket>;
    private readonly limit: number;
    private readonly windowMs: number;

    public constructor(limit: number, windowMs: number) {
        this.buckets = new Map<string, Bucket>();
        this.limit = limit;
        this.windowMs = windowMs;
    }

    public consume(key: string, now: number = Date.now()): RateLimitDecision {
        this.prune(now);
        const windowMs = this.windowMs;
        const bucket = this.buckets.get(key);
        const timestamps =
            bucket === undefined
                ? []
                : bucket.timestamps.filter(function fresh(value: number): boolean {
                      return now - value < windowMs;
                  });
        if (timestamps.length >= this.limit) {
            const oldest = timestamps[0] ?? now;
            const retryAfterSeconds = Math.max(
                1,
                Math.ceil((this.windowMs - (now - oldest)) / 1000),
            );
            this.buckets.set(key, { timestamps });
            return { allowed: false, remaining: 0, retryAfterSeconds };
        }
        timestamps.push(now);
        this.buckets.set(key, { timestamps });
        return {
            allowed: true,
            remaining: Math.max(0, this.limit - timestamps.length),
            retryAfterSeconds: 0,
        };
    }

    public remaining(key: string, now: number = Date.now()): number {
        const windowMs = this.windowMs;
        const bucket = this.buckets.get(key);
        if (bucket === undefined) {
            return this.limit;
        }
        const fresh = bucket.timestamps.filter(function freshTimestamp(value: number): boolean {
            return now - value < windowMs;
        });
        return Math.max(0, this.limit - fresh.length);
    }

    private prune(now: number): void {
        if (this.buckets.size < MAXIMUM_BUCKETS) {
            return;
        }
        const windowMs = this.windowMs;
        for (const [key, bucket] of this.buckets) {
            const hasFresh = bucket.timestamps.some(function fresh(value: number): boolean {
                return now - value < windowMs;
            });
            if (!hasFresh) {
                this.buckets.delete(key);
            }
            if (this.buckets.size < MAXIMUM_BUCKETS) {
                return;
            }
        }
        const overflow = this.buckets.size - MAXIMUM_BUCKETS;
        let removed = 0;
        for (const key of this.buckets.keys()) {
            this.buckets.delete(key);
            removed += 1;
            if (removed >= overflow) {
                return;
            }
        }
    }
}
