import { NextResponse } from 'next/server';
import prisma from "@/lib/db";
import { authentifierRequete } from "@/lib/api-auth";
import { isSafeWebhookUrl, EVENEMENTS } from "@/lib/webhook-dispatch";

/**
 * Configuration du webhook du marchand.
 *
 *  GET   /api/v1/config/webhook                 : adresses (production, test) et evenements choisis
 *  PATCH /api/v1/config/webhook                 : { webhookUrl?, mode?: "live" | "test", events?: string[] }
 *
 * `mode` dit quelle adresse on regle ; absent, c'est celle du monde de la cle
 * utilisee (une cle de test regle l'adresse de test). Une adresse vide retire
 * le webhook. `events` vide (ou absent) veut dire « tous les evenements ».
 */
function vue(config: any) {
    const choisis: string[] = Array.isArray(config.webhookEvents) ? config.webhookEvents : [];
    return {
        success: true,
        webhookUrl: config.webhookUrl || null,
        testWebhookUrl: config.testWebhookUrl || null,
        events: choisis.length ? choisis : [...EVENEMENTS],
        available_events: [...EVENEMENTS],
    };
}

export async function PATCH(req: Request) {
    try {
        const auth = await authentifierRequete(req);
        if (!auth) return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });

        const body = (await req.json().catch(() => null)) as any;
        if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON body expected' }, { status: 400 });
        const { webhookUrl, mode, events } = body;
        const data: Record<string, unknown> = {};

        if (webhookUrl !== undefined) {
            if (typeof webhookUrl !== 'string') return NextResponse.json({ error: 'webhookUrl must be a string' }, { status: 400 });
            const adresse = webhookUrl.trim();
            // SECURITY (SSRF): reject internal/loopback/metadata targets and non-https.
            if (adresse && !isSafeWebhookUrl(adresse)) {
                return NextResponse.json({ error: 'webhookUrl must be a public https URL' }, { status: 400 });
            }
            const monde = mode === 'test' || mode === 'live' ? mode : (auth.test ? 'test' : 'live');
            data[monde === 'test' ? 'testWebhookUrl' : 'webhookUrl'] = adresse || null;
        }

        if (events !== undefined) {
            if (!Array.isArray(events) || events.some((e) => typeof e !== 'string')) {
                return NextResponse.json({ error: 'events must be an array of event names' }, { status: 400 });
            }
            const inconnus = events.filter((e) => !(EVENEMENTS as readonly string[]).includes(e));
            if (inconnus.length) {
                return NextResponse.json({ error: `Unknown events: ${inconnus.join(', ')}`, available_events: [...EVENEMENTS] }, { status: 400 });
            }
            // La liste complete vaut « tous » : on la range vide, les futurs evenements suivront.
            data.webhookEvents = events.length === EVENEMENTS.length ? [] : Array.from(new Set(events));
        }

        if (!Object.keys(data).length) {
            return NextResponse.json({ error: 'Nothing to update: pass webhookUrl and/or events' }, { status: 400 });
        }

        const updated = await prisma.apiConfig.update({ where: { id: auth.config.id }, data: data as any });
        return NextResponse.json(vue(updated));
    } catch (error: any) {
        console.error('Config Webhook Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const auth = await authentifierRequete(req);
        if (!auth) return NextResponse.json({ error: 'Invalid API Key' }, { status: 401 });
        const config = await prisma.apiConfig.findUnique({ where: { id: auth.config.id } });
        return NextResponse.json(vue(config || auth.config));
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
