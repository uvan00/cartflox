import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import prisma from "@/lib/db";

// GET — fetch latest 20 notifications for current user
export async function GET() {
    const session = await getSession();
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const notifications = await (prisma as any).notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 20,
    });

    const unreadCount = await (prisma as any).notification.count({
        where: { userId: user.id, read: false },
    });

    return NextResponse.json({ notifications, unreadCount });
}
