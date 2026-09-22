/**
 * Lightweight structured JSON logger for Cartflox.
 * Outputs JSON in production (Railway log viewer) and readable format in dev.
 * Redacts sensitive fields automatically.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_NUM: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = new Set([
    // credentials
    "secretKey", "password", "token", "apiSecret", "masterKey", "privateKey",
    "secret", "apiKey", "publicKey", "webhookSecret", "secretHash", "sharedSecret",
    "authorization", "cookie",
    // customer PII
    "customerEmail", "customerPhone", "email", "phone", "phoneHash",
]);
const isDev = process.env.NODE_ENV !== "production";
const minLevel: number = LEVEL_NUM[(process.env.LOG_LEVEL as Level) || (isDev ? "debug" : "info")] ?? 20;

function redact(obj: unknown, depth = 0): unknown {
    if (depth > 4 || obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        out[k] = SENSITIVE.has(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
}

function log(level: Level, msg: string, ctx?: Record<string, unknown>) {
    if (LEVEL_NUM[level] < minLevel) return;
    const entry = {
        level,
        time: new Date().toISOString(),
        service: "afriflow",
        msg,
        ...(ctx ? (redact(ctx) as object) : {}),
    };
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(isDev ? `[${level.toUpperCase()}] ${msg}${ctx ? " " + JSON.stringify(redact(ctx)) : ""}` : JSON.stringify(entry));
}

const logger = {
    debug: (msg: string, ctx?: Record<string, unknown>) => log("debug", msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => log("info", msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => log("warn", msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => log("error", msg, ctx),
    child: (base: Record<string, unknown>) => ({
        debug: (msg: string, ctx?: Record<string, unknown>) => log("debug", msg, { ...base, ...ctx }),
        info: (msg: string, ctx?: Record<string, unknown>) => log("info", msg, { ...base, ...ctx }),
        warn: (msg: string, ctx?: Record<string, unknown>) => log("warn", msg, { ...base, ...ctx }),
        error: (msg: string, ctx?: Record<string, unknown>) => log("error", msg, { ...base, ...ctx }),
    }),
};

export default logger;
export const withContext = (ctx: Record<string, unknown>) => logger.child(ctx);
