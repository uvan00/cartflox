/**
 * Dynamic CORS utility for /api/v1/* public endpoints.
 * Allows origins configured per-application in DB metadata (allowedOrigins[]).
 * Falls back to wildcard if no origins configured (backwards compatible).
 */

const DEFAULT_HEADERS = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, idempotency-key",
    "Access-Control-Max-Age": "86400",
};

/**
 * Returns CORS headers for a given request origin and list of allowed origins.
 * @param requestOrigin  Value of the Origin request header
 * @param allowedOrigins Configured per-app origins, e.g. ["https://myshop.com"]
 */
export function getCorsHeaders(
    requestOrigin: string | null,
    allowedOrigins: string[] | null | undefined
): Record<string, string> {
    if (!allowedOrigins || allowedOrigins.length === 0) {
        // No restriction configured → allow all (legacy behaviour)
        return { ...DEFAULT_HEADERS, "Access-Control-Allow-Origin": "*" };
    }

    const origin = requestOrigin || "";
    const allowed = allowedOrigins.includes(origin) || allowedOrigins.includes("*");
    return {
        ...DEFAULT_HEADERS,
        "Access-Control-Allow-Origin": allowed ? origin : allowedOrigins[0],
        "Vary": "Origin",
    };
}

/** Shorthand for OPTIONS preflight response */
export function corsPreflightResponse(
    requestOrigin: string | null,
    allowedOrigins?: string[] | null
): Response {
    return new Response(null, {
        status: 204,
        headers: getCorsHeaders(requestOrigin, allowedOrigins),
    });
}
