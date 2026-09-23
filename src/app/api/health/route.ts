import { NextResponse } from "next/server";
import prisma from "@/lib/db";

/** Etat de l'application et de sa base, par le client Prisma partage (pas un pool par appel). */
export async function GET() {
    const start = Date.now();
    let dbStatus = "ok";
    let dbLatencyMs = 0;
    try {
        const t = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbLatencyMs = Date.now() - t;
    } catch {
        dbStatus = "error";
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
