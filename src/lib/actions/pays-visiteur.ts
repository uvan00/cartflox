"use server";

import { ipCourante } from "@/lib/ip-courante";

/**
 * Pays du visiteur d'apres son adresse IP, pour pre-choisir l'indicatif du
 * champ telephone (page d'un lien de paiement, page de paiement).
 *
 * Service : api.country.is (libre, sans cle, donnees GeoLite2). On ne resout
 * que l'adresse de L'APPELANT, jamais une adresse fournie par le navigateur,
 * et chaque adresse n'est demandee qu'une fois par jour (memoire bornee). Une
 * reponse lente ou absente rend null : le champ garde alors le pays devine par
 * le fuseau horaire du telephone.
 */

const MEMOIRE = new Map<string, { pays: string | null; le: number }>();
const DUREE = 24 * 60 * 60 * 1000;
const TAILLE_MAX = 5000;

function adressePrivee(ip: string): boolean {
    return ip === "unknown" || ip === "::1" || ip === "0.0.0.0"
        || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")
        || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^(fc|fd|fe80)/i.test(ip);
}

export async function paysDuVisiteur(): Promise<string | null> {
    const ip = (await ipCourante()).trim().replace(/^::ffff:/i, "");
    if (!ip || adressePrivee(ip)) return null;
    const connu = MEMOIRE.get(ip);
    if (connu && Date.now() - connu.le < DUREE) return connu.pays;
    let pays: string | null = null;
    try {
        const r = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(1200), cache: "no-store" });
        if (r.ok) {
            const j: any = await r.json();
            const code = String(j?.country || "").toUpperCase();
            pays = /^[A-Z]{2}$/.test(code) ? code : null;
        }
    } catch {
        // Incident passager : rien n'est memorise, la prochaine visite reessaie.
        return null;
    }
    if (MEMOIRE.size >= TAILLE_MAX) {
        const plusAncienne = MEMOIRE.keys().next().value;
        if (plusAncienne !== undefined) MEMOIRE.delete(plusAncienne);
    }
    MEMOIRE.set(ip, { pays, le: Date.now() });
    return pays;
}
