import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import prisma from "@/lib/db";

// PATCH — mark all notifications as read
export async function PATCH() {
    const session = await getSession();
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await (prisma as any).notification.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true },
    });

    return NextResponse.json({ success: true });
}
