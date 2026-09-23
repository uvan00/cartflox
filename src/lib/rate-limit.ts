/**
 * Fixed-window rate limiter.
 *
 * Uses Redis (shared across instances) when REDIS_URL is configured, otherwise
 * falls back to a per-instance in-memory store. Redis failures also fall back to
 * in-memory (fail toward availability, not lockout).
 */
import { getRedis } from "./redis";

interface WindowEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, WindowEntry>();

export interface RateLimitOptions {
    /** Max requests per window */
    limit: number;
    /** Window size in seconds */
    windowSec: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

function rateLimitInMemory(key: string, opts: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const windowMs = opts.windowSec * 1000;

    let entry = store.get(key);
    if (!entry || now >= entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs };
        store.set(key, entry);
    }

    entry.count++;
    const allowed = entry.count <= opts.limit;
    const remaining = Math.max(0, opts.limit - entry.count);

    // Cleanup old keys periodically
    if (store.size > 10_000) {
        for (const [k, v] of store.entries()) {
            if (now >= v.resetAt) store.delete(k);
        }
    }

    return { allowed, remaining, resetAt: entry.resetAt };
}

export async function rateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
    const redis = getRedis();
    if (redis) {
        try {
            const rk = `rl:${key}`;
            const count = await redis.incr(rk);
            if (count === 1) await redis.expire(rk, opts.windowSec);
            const ttl = await redis.ttl(rk);
            const resetAt = Date.now() + (ttl > 0 ? ttl * 1000 : opts.windowSec * 1000);
            return { allowed: count <= opts.limit, remaining: Math.max(0, opts.limit - count), resetAt };
        } catch {
            // Redis hiccup → fall back to in-memory rather than locking users out.
        }
    }
    return rateLimitInMemory(key, opts);
}

/**
 * IP du client. Le mandataire (nginx...) doit ecraser X-Real-IP avec l'adresse
 * de la connexion : la valeur est alors sure. En repli, le DERNIER element de
 * X-Forwarded-For est celui pose par le mandataire ; le premier peut etre ecrit
 * par le client lui-meme.
 */
export function getClientIp(req: Request): string {
    const h = req.headers as any;
    const xff = String(h.get?.('x-forwarded-for') || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    return h.get?.('x-real-ip') || xff[xff.length - 1] || 'unknown';
}
