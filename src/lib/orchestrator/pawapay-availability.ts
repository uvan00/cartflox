/**
 * Marchés réellement actifs d'un compte PawaPay (endpoint lecture seule
 * /active-conf). Sert à ne proposer au checkout que les correspondants que le
 * compte peut encaisser : un compte n'active en général qu'une partie des
 * 20+ marchés PawaPay, et un dépôt vers un marché non activé échoue toujours
 * ("Invalid currency").
 *
 * Cache en mémoire par clé API (process PM2 unique) avec TTL. En cas d'échec
 * réseau ou de réponse inattendue : fail-open (retourne null → aucune méthode
 * n'est masquée), pour ne jamais dégrader un checkout à cause d'un appel de
 * configuration.
 */

const TTL_MS = 6 * 60 * 60 * 1000; // 6 h

const cache = new Map<string, { correspondents: Set<string>; ts: number }>();

export async function getPawaPayActiveCorrespondents(
    apiKey: string | null | undefined
): Promise<Set<string> | null> {
    if (!apiKey) return null;

    const hit = cache.get(apiKey);
    if (hit && Date.now() - hit.ts < TTL_MS) return hit.correspondents;

    try {
        const res = await fetch("https://api.pawapay.io/active-conf", {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return hit?.correspondents ?? null;

        const data: any = await res.json();
        const correspondents = new Set<string>();
        for (const country of data?.countries ?? []) {
            for (const corr of country?.correspondents ?? []) {
                if (corr?.correspondent) correspondents.add(corr.correspondent);
            }
        }
        // Réponse vide = forme inattendue → fail-open plutôt que tout masquer
        if (correspondents.size === 0) return hit?.correspondents ?? null;

        cache.set(apiKey, { correspondents, ts: Date.now() });
        return correspondents;
    } catch {
        return hit?.correspondents ?? null;
    }
}
