import { NextResponse } from 'next/server';
import prisma from "@/lib/db";
import { authenticateApiKey } from "@/lib/api-auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
    try {
        // Rate limit (per IP) to cap abuse of payment-link creation.
        const ip = getClientIp(req);
        const rl = await rateLimit(`payment_link_create:${ip}`, { limit: 60, windowSec: 60 });
        if (!rl.allowed) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
        }

        const authHeader = req.headers.get('authorization');
        const apiKeyHeader = req.headers.get('x-api-key');

        // Support both Bearer token and x-api-key
        let secretKey = '';
        if (authHeader && authHeader.startsWith('Bearer ')) {
            secretKey = authHeader.split(' ')[1];
        } else if (apiKeyHeader) {
            secretKey = apiKeyHeader;
        }

        if (!secretKey) {
            return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
        }

        // Validate Key
        const auth = await authenticateApiKey(secretKey);
        if (!auth) {
            return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
        }
        const { config } = auth;
        // Un lien de paiement vit en production ; le bac a sable passe par les sessions.
        if (auth.test) {
            return NextResponse.json({ error: 'Payment links are not available in test mode: create a checkout session with your test key instead.', code: 'test_mode' }, { status: 403 });
        }

        const body = await req.json();
        const {
            title, description, amount, currency = "XOF", metadata,
            // Montant laisse au payeur : `amount` devient une suggestion (0 possible).
            amount_free: amountFree, amount_min: amountMin, amount_max: amountMax,
            // true : le payeur paie les frais de service ; false : le marchand ;
            // absent : le reglage de l'espace fait foi.
            fees_on_customer: feesOnCustomer,
        } = body;

        const libre = amountFree === true;
        if (!title || (!libre && !amount)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        const mini = libre ? Math.max(0, Number(amountMin) || 0) : 0;
        const maxi = libre ? Math.max(0, Number(amountMax) || 0) : 0;
        if (mini > 0 && maxi > 0 && maxi < mini) {
            return NextResponse.json({ error: 'amount_max must be greater than amount_min' }, { status: 400 });
        }

        const slug = Math.random().toString(36).substring(2, 10);

        const paymentLink = await prisma.paymentLink.create({
            data: {
                applicationId: config.applicationId,
                title,
                description,
                amount: Math.max(0, parseFloat(amount) || 0),
                currency: String(currency || "XOF").toUpperCase(),
                slug,
                status: "active",
                requestPhone: true, // Force phone collection for Mobile Money
                allowQuantity: false,
                amountFree: libre,
                amountMin: mini > 0 ? mini : null,
                amountMax: maxi > 0 ? maxi : null,
                feesOnCustomer: typeof feesOnCustomer === "boolean" ? feesOnCustomer : null,
            } as any
        });

        // Construct full URL for production/local
        const baseUrl = process.env.LIENS_PUBLIC_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const url = `${baseUrl}/pay/${slug}`;

        return NextResponse.json({
            success: true,
            id: paymentLink.id,
            url,
            slug,
            amount: paymentLink.amount,
            amount_free: libre,
            currency: paymentLink.currency
        });

    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
