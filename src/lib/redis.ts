import Redis from 'ioredis';

/**
 * Shared ioredis client — but ONLY when REDIS_URL is configured.
 *
 * Returning null otherwise lets callers (e.g. the rate limiter) fall back to a
 * per-instance in-memory implementation, and avoids ioredis spamming connection
 * errors trying to reach a non-existent localhost server. Set REDIS_URL to make
 * rate limiting (and any future shared state) work across multiple instances.
 */

const g = global as unknown as { __afriflowRedis?: Redis | null };

export function getRedis(): Redis | null {
    if (g.__afriflowRedis !== undefined) return g.__afriflowRedis;
    const url = process.env.REDIS_URL;
    if (!url) {
        g.__afriflowRedis = null;
        return null;
    }
    const client = new Redis(url, { maxRetriesPerRequest: 2 });
    client.on('error', (e) => console.error('[redis] error:', e.message));
    g.__afriflowRedis = client;
    return client;
}
