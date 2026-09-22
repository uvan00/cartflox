import { DELAI_MS, URL_RAPPEL, injoignable, lireJson, refus, type Fournisseur } from "../types";

/**
 * Monetbil « Disbursements » (Cameroun) : un seul appel, la reponse est
 * synchrone. Monetbil ne documente AUCUN point d'etat : la seule autre source
 * est sa notification sur `payout_notification_url`. Documentation :
 * monetbil.company/doc/sandbox/disbursement
 */
const OPERATEURS: Record<string, Record<string, string>> = {
    CM: { mtn_money: "CM_MTNMOBILEMONEY", orange_money: "CM_ORANGEMONEY", express_union: "CM_EUMM" },
};
const CHEMINS = ["https://api.monetbil.com/payment/v1/payouts/withdrawal", "https://api.monetbil.com/v1/payouts/withdrawal"];

export const monetbill: Fournisseur = {
    cle: "monetbill",
    nom: "Monetbil",
    motif: /monetbil/i,
    verifieParNotreReference: false,
    cles: [{ champ: "serviceKey", libelle: "clé de service" }, { champ: "serviceSecret", libelle: "secret de service" }],
    avertissement: "Monetbil ne permet pas d'interroger l'état d'un envoi : son issue vient de sa réponse immédiate et de sa notification.",
    correspondant: (pays, operateur) => OPERATEURS[pays.toUpperCase()]?.[operateur] || null,

    async initier(config, d) {
        const operateur = OPERATEURS[d.country.toUpperCase()]?.[d.operator];
        if (!operateur) return refus(d, "OPERATEUR_INCONNU", `Monetbil ne dessert pas ${d.operator} en ${d.country}.`);
        const corps = JSON.stringify({
            service_key: config.serviceKey, service_secret: config.serviceSecret,
            processing_number: d.reference, payout_notification_url: URL_RAPPEL("monetbill"),
            phonenumber: d.phone, amount: Math.round(d.amount), operator: operateur,
        });
        let res: Response | null = null;
        for (const url of CHEMINS) {
            try {
                res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: corps, signal: AbortSignal.timeout(DELAI_MS) });
            } catch (e) {
                throw injoignable("Monetbil", e);
            }
            if (res.status !== 404) break; // 404 : rien n'a ete traite, on essaie l'autre chemin
        }
        const j = await lireJson(res as Response);
        if (!(res as Response).ok || j.success !== true) {
            return refus(d, String(j.code || (res as Response).status), j.message || "Monetbil a refusé l'envoi.", j, operateur);
        }
        return {
            providerReference: String(j.transaction || d.reference),
            status: j.operator_transaction_id ? "SUCCESS" : "PENDING",
            providerCode: operateur,
            providerTransactionId: j.operator_transaction_id ? String(j.operator_transaction_id) : undefined,
            rawData: j,
        };
    },
};
