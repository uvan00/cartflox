import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import { getSelectedAppId } from "@/lib/actions/utils";
const p = prisma as any;

async function getAppId(): Promise<string | null> {
    return getSelectedAppId();
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.email) {
            return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 });
        }

        const { themeId } = await req.json() as any;
        if (!themeId) {
            return NextResponse.json({ success: false, error: "themeId manquant" }, { status: 400 });
        }

        const cookieStore = await cookies();
        const cookieAppId = cookieStore.get("applicationId")?.value;
        const appId = await getAppId();

        if (!appId) {
            return NextResponse.json({ success: false, error: "Aucune application trouvée" }, { status: 404 });
        }

        // Fetch current metadata then merge
        const current = await p.application.findUnique({ where: { id: appId } });
        const existingMeta = (current?.metadata as Record<string, any>) ?? {};

        await p.application.update({
            where: { id: appId },
            data: { metadata: { ...existingMeta, checkoutTheme: themeId } }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("POST /api/settings/checkout-theme error:", error?.message);
        return NextResponse.json({ success: false, error: error?.message ?? "Erreur serveur" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.email) {
            return NextResponse.json({ success: false, error: "Non authentifié" }, { status: 401 });
        }

        const cookieStore = await cookies();
        const cookieAppId = cookieStore.get("applicationId")?.value;
        const appId = await getAppId();
        if (!appId) return NextResponse.json({ checkoutTheme: null });

        const app = await p.application.findUnique({ where: { id: appId } });

        const meta = (app?.metadata as Record<string, any>) ?? {};
        return NextResponse.json({ checkoutTheme: meta.checkoutTheme ?? null });
    } catch (error: any) {
        console.error("GET /api/settings/checkout-theme error:", error?.message);
        return NextResponse.json({ checkoutTheme: null });
    }
}
