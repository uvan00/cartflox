import { NextResponse } from "next/server";
import pg from "pg";

export async function GET() {
    const start = Date.now();
    let dbStatus = "ok";
    let dbLatencyMs = 0;

    const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
        idleTimeoutMillis: 5000,
    });

    try {
        const t = Date.now();
        const client = await pool.connect();
        await client.query("SELECT 1");
        client.release();
        dbLatencyMs = Date.now() - t;
    } catch {
        dbStatus = "error";
    } finally {
        await pool.end().catch(() => {});
    }

    const healthy = dbStatus === "ok";

    return NextResponse.json(
        {
            status: healthy ? "ok" : "degraded",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            db: { status: dbStatus, latencyMs: dbLatencyMs },
            responseMs: Date.now() - start,
        },
        { status: healthy ? 200 : 503 }
    );
}
