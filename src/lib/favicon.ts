import { isSafeWebhookUrl } from "@/lib/webhook-dispatch";

/**
 * Le logo d'un espace, devine depuis le site que le marchand a indique : on
 * lit son favicon. Ca evite de demander un logo a l'inscription, alors que le
 * site en porte deja un.
 *
 * SECURITE : l'adresse vient du marchand, donc le serveur irait chercher ce
 * qu'on lui demande. On reutilise la garde des webhooks (`isSafeWebhookUrl`),
 * qui refuse localhost, les plages privees, le lien-local et les points
 * d'acces aux metadonnees du fournisseur, et on la re-applique APRES chaque
 * redirection : sinon un site public pourrait renvoyer vers 169.254.169.254.
 */
const OCTETS_MAX = 400 * 1024;      // un favicon depasse rarement 100 Ko
const DELAI = 6000;
const TYPES = /^image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/i;

/** Un GET prudent : https seulement, redirections suivies a la main, taille bornee. */
async function recuperer(url: string, sauts = 3): Promise<Response | null> {
    let courante = url;
    for (let i = 0; i <= sauts; i++) {
        if (!isSafeWebhookUrl(courante)) return null;
        let r: Response;
        try {
            r = await fetch(courante, {
                redirect: "manual",
                signal: AbortSignal.timeout(DELAI),
                headers: { "user-agent": "Cartflox/1.0", accept: "text/html,image/*" },
            });
        } catch {
            return null;
        }
        if (r.status >= 300 && r.status < 400) {
            const suite = r.headers.get("location");
            if (!suite) return null;
            courante = new URL(suite, courante).toString();
            continue;
        }
        return r.ok ? r : null;
    }
    return null;
}

/** Lit au plus OCTETS_MAX, sans jamais charger une reponse enorme en memoire. */
async function corpsBorne(r: Response): Promise<Buffer | null> {
    const annonce = Number(r.headers.get("content-length") || 0);
    if (annonce > OCTETS_MAX) return null;
    const lecteur = r.body?.getReader();
    if (!lecteur) return null;
    const morceaux: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await lecteur.read();
        if (done) break;
        total += value.length;
        if (total > OCTETS_MAX) { await lecteur.cancel().catch(() => { }); return null; }
        morceaux.push(value);
    }
    return Buffer.concat(morceaux);
}

/** Les adresses d'icone declarees dans le HTML, de la plus grande a la plus petite. */
function iconesDeclarees(html: string, base: string): string[] {
    const trouvees: { href: string; taille: number }[] = [];
    for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
        const balise = m[0];
        const rel = /rel=["']([^"']+)["']/i.exec(balise)?.[1]?.toLowerCase() || "";
        if (!/\b(icon|shortcut icon|apple-touch-icon|apple-touch-icon-precomposed)\b/.test(rel)) continue;
        const href = /href=["']([^"']+)["']/i.exec(balise)?.[1];
        if (!href) continue;
        const sizes = /sizes=["']([^"']+)["']/i.exec(balise)?.[1] || "";
        const taille = Number(/(\d+)x\d+/i.exec(sizes)?.[1] || (rel.includes("apple") ? 180 : 32));
        try { trouvees.push({ href: new URL(href, base).toString(), taille }); } catch { /* href invalide */ }
    }
    return trouvees.sort((a, b) => b.taille - a.taille).map((x) => x.href);
}

/**
 * Renvoie le favicon du site sous forme d'adresse `data:` prete a etre stockee
 * dans `Application.image`, ou null si le site n'en expose pas d'exploitable.
 * Ne leve jamais : un logo absent ne doit pas empecher de creer un espace.
 */
export async function faviconDuSite(siteWeb: string): Promise<string | null> {
    try {
        if (!siteWeb || !isSafeWebhookUrl(siteWeb)) return null;
        const base = new URL(siteWeb);

        const candidats: string[] = [];
        const page = await recuperer(base.toString());
        if (page && (page.headers.get("content-type") || "").includes("text/html")) {
            const html = (await corpsBorne(page).catch(() => null))?.toString("utf8").slice(0, 200_000) || "";
            candidats.push(...iconesDeclarees(html, base.toString()));
        }
        candidats.push(new URL("/favicon.ico", base).toString(), new URL("/favicon.png", base).toString());

        for (const adresse of candidats.slice(0, 5)) {
            const r = await recuperer(adresse);
            if (!r) continue;
            const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
            if (!TYPES.test(type)) continue;
            const octets = await corpsBorne(r).catch(() => null);
            if (!octets || octets.length < 64) continue;   // 1x1 transparent ou page d'erreur
            return `data:${type};base64,${octets.toString("base64")}`;
        }
        return null;
    } catch {
        return null;
    }
}
