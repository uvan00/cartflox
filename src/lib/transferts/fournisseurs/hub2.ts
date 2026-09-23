import { DELAI_MS, injoignable, lireJson, refus, type Fournisseur, type PayoutResponse } from "../types";

/**
 * Hub2 « Transfers » : un seul appel, POST /transfers, puis
 * GET /transfers/{id}/status. Un compte marchand PAR PAYS : les en-tetes
 * viennent du compte du pays vise. Documentation : docs.hub2.io/integration/en/transfers
 * Noms d'operateurs de Hub2 (GET /data/providers?country=XX) : T-Money y est
 * « Togocell », Moov Mali « Mobicash », et Hub2 n'ouvre pas le Ghana.
 */
const FOURNISSEURS: Record<string, Record<string, string>> = {
    CI: { orange_money: "orange", mtn_money: "mtn", moov_money: "moov", wave: "wave" },
    SN: { orange_money: "orange", wave: "wave" },
    BJ: { mtn_money: "mtn", moov_money: "moov" },
    ML: { orange_money: "orange", moov_money: "mobicash" },
    BF: { orange_money: "orange", moov_money: "moov" },
    TG: { tmoney: "togocell", moov_money: "moov" },
    CM: { mtn_money: "mtn" },
};
const BASE = "https://api.hub2.io";

function compte(config: any, pays?: string | null) {
    const c = pays ? (config.comptesPays || {})[pays.toUpperCase()] : null;
    return c?.merchantId && c?.apiKey ? c : { merchantId: config.merchantId, apiKey: config.apiKey };
}
function entetes(config: any, pays?: string | null) {
    const c = compte(config, pays);
    return { "Content-Type": "application/json", ApiKey: c.apiKey, MerchantId: c.merchantId, Environment: config.mode === "live" ? "live" : "sandbox" };
}
function paysConfigures(config: any): (string | null)[] {
    const codes = Object.entries(config.comptesPays || {}).filter(([, c]: any) => c?.merchantId && c?.apiKey).map(([code]) => code);
    return config.merchantId && config.apiKey ? [null, ...codes] : codes;
}
const statut = (s: unknown): PayoutResponse["status"] => {
    const v = String(s || "").toLowerCase();
    if (["successful", "success", "completed", "complete"].includes(v)) return "SUCCESS";
    if (["failed", "failure", "rejected", "cancelled", "canceled", "error"].includes(v)) return "FAILED";
    return "PENDING";
};

export const hub2: Fournisseur = {
    cle: "hub2",
    nom: "Hub2",
    motif: /hub2/i,
    verifieParNotreReference: false,
    cles: [{ champ: "apiKey", libelle: "clé API" }, { champ: "merchantId", libelle: "identifiant marchand" }],
    correspondant: (pays, operateur) => FOURNISSEURS[pays.toUpperCase()]?.[operateur] || null,

    async initier(config, d) {
        const pays = d.country.toUpperCase();
        const fournisseur = FOURNISSEURS[pays]?.[d.operator];
        if (!fournisseur) return refus(d, "OPERATEUR_INCONNU", `Hub2 ne dessert pas ${d.operator} en ${pays}.`);
        let res: Response;
        try {
            res = await fetch(`${BASE}/transfers`, {
                method: "POST", headers: entetes(config, pays), signal: AbortSignal.timeout(DELAI_MS),
                body: JSON.stringify({
                    reference: d.reference,
                    amount: Math.round(d.amount),
                    currency: d.currency.toUpperCase(),
                    description: (d.description || "Transfert").slice(0, 100),
                    destination: { type: "mobile_money", country: pays, recipientName: (d.recipientName || "Bénéficiaire").slice(0, 80), msisdn: `+${d.phone}`, provider: fournisseur },
                }),
            });
        } catch (e) {
            throw injoignable("Hub2", e);
        }
        const j = await lireJson(res);
        if (!res.ok) return refus(d, j.code || j.error || `HTTP_${res.status}`, j.message || j.error_description || "Hub2 a refusé le transfert.", j, fournisseur);
        return { providerReference: String(j.id || j.transferId || d.reference), status: statut(j.status), providerCode: fournisseur, rawData: j };
    },

    async verifier(config, id) {
        let dernier: any = null;
        for (const pays of paysConfigures(config)) {
            const res = await fetch(`${BASE}/transfers/${encodeURIComponent(id)}/status`, { headers: entetes(config, pays), signal: AbortSignal.timeout(DELAI_MS) });
            const j = await lireJson(res);
            if (res.ok) {
                const s = j.status || j.data?.status || j.state || j.transfer?.status;
                const raison = j.failureReason || j.error || j.data?.failureReason;
                return { providerReference: id, status: statut(s), failureCode: raison?.code, failureMessage: raison?.message || (typeof raison === "string" ? raison : undefined), rawData: j };
            }
            dernier = { http: res.status, corps: j };
            if (res.status !== 401 && res.status !== 403 && res.status !== 404) break;
        }
        // Aucun compte ne connait ce transfert : on ne conclut rien, on laisse ouvert.
        return { providerReference: id, status: "PENDING", rawData: { indetermine: true, dernier } };
    },
};
