import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import prisma from "@/lib/db";

// PATCH — mark one notification as read
export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    await (prisma as any).notification.updateMany({
        where: { id, user: { email: session.user.email } },
        data: { read: true },
    });

    return NextResponse.json({ success: true });
}
