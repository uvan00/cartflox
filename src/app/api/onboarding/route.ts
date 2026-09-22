import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Modes valides pour Application.paymentMode
// Un seul mode d'encaissement : le marchand branche SES cles.
// Le mode « geré » routait vers des passerelles plateforme inexistantes
// (54 tentatives, 0 reussite) et faisait de Cartflox un detenteur de fonds,
// avec les obligations reglementaires qui vont avec. Il est retire.
const MODE_UNIQUE = "own_keys";

// Redirection relative : le navigateur la résout sur le bon domaine
// (derrière le reverse-proxy, req.url pointe sur localhost:3002 — à éviter).
function redirectTo(path: string) {
    return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/**
 * Onboarding : creation de l'espace d'encaissement du nouveau marchand.
 * Il n'y a qu'un mode : le marchand branche SES propres cles agregateurs et
 * l'argent arrive directement chez lui. Cartflox orchestre le routage sans
 * jamais detenir les fonds.
 * On crée (ou met à jour) son Application avec ce mode, puis on l'envoie au dashboard.
 */
export async function POST(req: Request) {
    const session = await getSession();
    if (!session?.user?.email) {
        return redirectTo("/auth/login?callbackUrl=/onboarding");
    }

    // Réponses de l'onboarding (Étape 1 : activité, Étape 2 : mode)
    const mode = MODE_UNIQUE;
    let name = "";
    let category: string | null = null;
    let website: string | null = null;
    let country: string | null = null;
    try {
        const form = await req.formData();
        // Le champ « mode » du formulaire est ignore : voir MODE_UNIQUE.
        name = String(form.get("name") || "").trim().slice(0, 120);
        const cat = String(form.get("category") || "").trim();
        category = cat ? cat.slice(0, 80) : null;
        // site-obligatoire : on complete le protocole si l'utilisateur l'a omis.
        const web = String(form.get("website") || "").trim().replace(/\s+/g, "");
        website = web ? (/^https?:\/\//i.test(web) ? web : `https://${web}`).slice(0, 200) : null;
        const cty = String(form.get("country") || "").trim();
        country = cty ? cty.slice(0, 80) : null;
    } catch {
        // pas de corps exploitable : on garde les défauts
    }

    const p = prisma as any;
    const user = await p.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
        return redirectTo("/auth/login");
    }

    try {
        const existing = await p.application.findFirst({ where: { userId: user.id } });
        const meta = country ? { country } : undefined;
        if (existing) {
            const data: any = { paymentMode: mode };
            if (name) data.name = name;
            if (category) data.category = category;
            if (website) data.website = website;
            if (meta) data.metadata = { ...(existing.metadata || {}), ...meta };
            await p.application.update({ where: { id: existing.id }, data });
        } else {
            await p.application.create({
                data: {
                    name: name || user.name || "Mon commerce",
                    category,
                    website,
                    userId: user.id,
                    paymentMode: mode,
                    ...(meta ? { metadata: meta } : {}),
                },
            });
        }
    } catch (e) {
        console.error("onboarding: échec enregistrement de l'espace", e);
        // On n'empêche pas l'accès au dashboard si la persistance échoue.
    }

    return redirectTo("/dashboard?bienvenue=1");
}
