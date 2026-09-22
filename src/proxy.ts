import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Un seul hote, une application : le tableau de bord exige une session, tout
 * le reste (pages de paiement, API, documentation) est public ou protege par
 * ses propres cles.
 *
 * Option : `CHECKOUT_HOST` (ex. `checkout.mondomaine.com`) sert la page de
 * paiement sous une adresse courte `/<id>` ; la reecriture est dans
 * next.config.ts, le proxy ne fait ici que ramener la forme longue a la courte.
 */
const PROTECTED_PATHS = [
    "/dashboard", "/settings", "/gateways", "/methods", "/transactions", "/customers",
    "/analytics", "/integrations", "/campaigns", "/webhooks", "/team",
    "/payment-links", "/billing", "/developer", "/security", "/statistics",
    "/transfers", "/applications",
];
const CHECKOUT_HOST = (process.env.CHECKOUT_HOST || "").toLowerCase();

function hoteDe(req: NextRequest): string {
    const h = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    return h.split(":")[0].toLowerCase();
}

// Derriere un reverse proxy, req.nextUrl garde l'hote interne : on reconstruit
// les redirections sur l'hote public.
function origineDe(req: NextRequest): string {
    const host = hoteDe(req) || "localhost";
    const proto = req.headers.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
}

async function connecte(req: NextRequest): Promise<boolean> {
    try {
        const s = await auth.api.getSession({ headers: req.headers });
        return !!s?.user?.email;
    } catch {
        return false;
    }
}

function suivant(req: NextRequest) {
    const entetes = new Headers(req.headers);
    // Un seul espace de travail ; l'en-tete reste pour les lecteurs existants et ne peut pas etre forge.
    entetes.set("x-cf-espace", "classique");
    return NextResponse.next({ request: { headers: entetes } });
}

export async function proxy(req: NextRequest) {
    const { pathname, search } = req.nextUrl;
    const hote = hoteDe(req);

    if (CHECKOUT_HOST && hote === CHECKOUT_HOST) {
        if (pathname === "/") return NextResponse.redirect(new URL("/", origineDe(req).replace(hote, hote.replace(/^checkout\./, ""))), 307);
        const longue = pathname.match(/^\/checkout\/(.+)$/);
        if (longue) return NextResponse.redirect(new URL("/" + longue[1] + search, `https://${CHECKOUT_HOST}`), 308);
        return NextResponse.next();
    }

    const duTableau = PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!duTableau) return suivant(req);

    if (!(await connecte(req))) {
        const url = new URL("/auth/login", origineDe(req));
        url.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(url);
    }
    return suivant(req);
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
