import { DELAI_MS, injoignable, lireJson, refus, type Fournisseur, type PayoutResponse } from "../types";

/**
 * FeexPay « Payout » : le point d'envoi existait deja dans l'adaptateur
 * (api/payouts/public/transfer/global), mais la documentation de FeexPay n'est
 * pas accessible depuis ici. L'integration est donc NON VERIFIEE : a essayer
 * d'abord en bac a sable (mode SANDBOX de la passerelle).
 */
const RESEAUX: Record<string, Record<string, string>> = {
    BJ: { mtn_money: "MTN", moov_money: "MOOV" },
    TG: { moov_money: "MOOV" },
    CI: { mtn_money: "MTN", moov_money: "MOOV" },
    CG: { mtn_money: "MTN" },
};
const BASE = "https://api.feexpay.me";
const entetes = (config: any) => ({ "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` });
const statut = (s: unknown): PayoutResponse["status"] => {
    const v = String(s || "").toUpperCase();
    if (["SUCCESSFUL", "SUCCESS", "COMPLETED"].includes(v)) return "SUCCESS";
    if (["FAILED", "REJECTED", "CANCELLED", "ERROR"].includes(v)) return "FAILED";
    return "PENDING";
};

export const feexpay: Fournisseur = {
    cle: "feexpay",
    nom: "FeexPay",
    motif: /feexpay/i,
    verifieParNotreReference: false,
    cles: [{ champ: "apiKey", libelle: "jeton API" }, { champ: "shopId", libelle: "identifiant de boutique" }],
    avertissement: "Envoi FeexPay non vérifié : leur documentation n'est pas accessible. Essayez d'abord en bac à sable.",
    correspondant: (pays, operateur) => RESEAUX[pays.toUpperCase()]?.[operateur] || null,

    async initier(config, d) {
        const reseau = RESEAUX[d.country.toUpperCase()]?.[d.operator];
        if (!reseau) return refus(d, "OPERATEUR_INCONNU", `FeexPay ne dessert pas ${d.operator} en ${d.country}.`);
        let res: Response;
        try {
            res = await fetch(`${BASE}/api/payouts/public/transfer/global`, {
                method: "POST", headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS),
                body: JSON.stringify({ phone: d.phone, amount: Math.round(d.amount), network: reseau, country: d.country.toUpperCase(), motif: (d.description || "Transfert").slice(0, 100), reference: d.reference, shop: config.shopId }),
            });
        } catch (e) {
            throw injoignable("FeexPay", e);
        }
        const j = await lireJson(res);
        if (!res.ok || (j.success === false) || (!j.success && !j.reference && !j.financialTransactionId)) {
            return refus(d, String(j.code || res.status), j.message || "FeexPay a refusé l'envoi.", j, reseau);
        }
        return { providerReference: String(j.reference || j.financialTransactionId || d.reference), status: j.status ? statut(j.status) : "PENDING", providerCode: reseau, rawData: j };
    },

    async verifier(config, reference) {
        const res = await fetch(`${BASE}/api/transactions/public/single/status/${encodeURIComponent(reference)}`, { headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS) });
        const j = await lireJson(res);
        if (res.status === 404) return { providerReference: reference, status: "PENDING", rawData: { indetermine: true, corps: j } };
        if (!res.ok) throw new Error(`FeexPay envoi ${reference} : ${j.message || res.status}`);
        return { providerReference: reference, status: statut(j.status), rawData: j };
    },
};
