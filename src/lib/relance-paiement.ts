/**
 * Pas de nouvelle demande par-dessus une demande qui attend encore sur le
 * telephone du client. Constate le 26/09/2026 : un client MTN Cameroun a recu
 * 7 demandes en 22 minutes a force de recliquer sur « Payer », et l'operateur
 * les a toutes laissees expirer (PAYMENT_NOT_APPROVED). La page reaffiche la
 * demande en cours et son code de secours au lieu d'en envoyer une autre.
 */
export const DELAI_RELANCE_MS = 90_000;

/** La demande envoyee au dernier essai, gardee dans Transaction.metadata.dernierEnvoi. */
export type DernierEnvoi = { le: string; methode: string; telephone: string; pousse: boolean; consigne: string | null; ussd: string | null; incertain?: boolean };

const chiffres = (v: unknown) => String(v || "").replace(/\D/g, "");

/** Ce qu'on retient d'une demande qui vient de partir. `pousse` : une demande attend sur le telephone (ni page externe, ni code a saisir chez nous). */
/** `incertain` : le fournisseur n'a pas répondu à temps, la demande a pu partir (tentative INCERTAINE). */
export function dernierEnvoi(o: { methode: string; telephone: string; pousse: boolean; rawData?: unknown; incertain?: boolean }, maintenant = new Date()): DernierEnvoi {
    const r = (o.rawData || {}) as Record<string, unknown>;
    return {
        le: maintenant.toISOString(),
        methode: o.methode,
        telephone: chiffres(o.telephone),
        pousse: o.pousse,
        consigne: typeof r._instructions === "string" && r._instructions ? r._instructions : null,
        ussd: typeof r._ussd === "string" && r._ussd ? r._ussd : null,
        ...(o.incertain ? { incertain: true } : {}),
    };
}

/**
 * La demande precedente attend encore, meme moyen et meme numero, depuis moins
 * de 90 s ? Elle est renvoyee, sinon null (on peut envoyer une nouvelle demande :
 * autre numero, autre moyen, demande echouee ou assez ancienne).
 */
export function relanceRetenue(
    tx: { status: string; providerRef?: string | null; metadata?: unknown },
    methode: string,
    telephone: string,
    maintenant = Date.now(),
): DernierEnvoi | null {
    const p = (tx.metadata as { dernierEnvoi?: DernierEnvoi } | null)?.dernierEnvoi;
    const tel = chiffres(telephone);
    // Une demande INCERTAINE (délai dépassé) n'a pas forcément de référence : elle retient quand même.
    if (tx.status !== "PENDING" || (!tx.providerRef && !p?.incertain) || !p?.pousse || p.methode !== methode || !tel || String(p.telephone || "") !== tel) return null;
    const ecoule = maintenant - Date.parse(String(p.le || ""));
    return ecoule >= 0 && ecoule < DELAI_RELANCE_MS ? p : null;
}
