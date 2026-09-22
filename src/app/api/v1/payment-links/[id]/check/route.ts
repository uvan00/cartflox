import { NextResponse } from 'next/server';
import prisma from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-auth";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const authHeader = req.headers.get('authorization');
        const apiKeyHeader = req.headers.get('x-api-key');

        let secretKey = '';
        if (authHeader && authHeader.startsWith('Bearer ')) {
            secretKey = authHeader.split(' ')[1];
        } else if (apiKeyHeader) {
            secretKey = apiKeyHeader;
        }

        if (!secretKey) {
            return NextResponse.json({ error: 'Missing Authorization' }, { status: 401 });
        }

        const auth = await authenticateApiKey(secretKey);
        if (!auth) {
            return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
        }
        const { config } = auth;

        const successRecord = await prisma.transaction.findFirst({
            where: {
                applicationId: config.applicationId,
                status: 'SUCCESS',
                metadata: {
                    path: ['paymentLinkId'],
                    equals: id
                }
            } as any,
            orderBy: { createdAt: 'desc' }
        });

        if (successRecord) {
            return NextResponse.json({
                success: true,
                paid: true,
                status: 'SUCCESS',
                transaction: {
                    id: successRecord.id,
                    amount: successRecord.amount,
                    customerName: (successRecord as any).customerName,
                    customerEmail: (successRecord as any).customerEmail
                }
            });
        }

        const pendingRecord = await prisma.transaction.findFirst({
            where: {
                applicationId: config.applicationId,
                status: { not: 'FAILED' },
                metadata: {
                    path: ['paymentLinkId'],
                    equals: id
                }
            } as any,
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json({
            success: true,
            paid: false,
            status: pendingRecord ? pendingRecord.status : 'WAITING'
        });

    } catch (error) {
        console.error("Check Status Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
