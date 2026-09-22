import { DELAI_MS, URL_RAPPEL, injoignable, lireJson, numeroNational, refus, type Fournisseur, type PayoutResponse } from "../types";

/**
 * PayDunya « API PUSH » (deboursement), en trois temps : la facture
 * (get-invoice), l'envoi (submit-invoice), l'etat (check-status). Le jeton de
 * facture est la cle de suivi : c'est lui qu'on garde en reference fournisseur.
 * XOF uniquement, montant entier. Documentation : developers.paydunya.com/doc/FR/api_deboursement
 */
const MODES: Record<string, Record<string, string>> = {
    SN: { orange_money: "orange-money-senegal", free_money: "free-money-senegal", expresso: "expresso-senegal", wave: "wave-senegal", djamo: "djamo-sn" },
    BJ: { mtn_money: "mtn-benin", moov_money: "moov-benin", celtiis: "celtiis-cash" },
    CI: { mtn_money: "mtn-ci", orange_money: "orange-money-ci", moov_money: "moov-ci", wave: "wave-ci", djamo: "djamo-ci" },
    TG: { tmoney: "t-money-togo", moov_money: "moov-togo" },
    ML: { orange_money: "orange-money-mali" },
    BF: { orange_money: "orange-money-burkina", moov_money: "moov-burkina-faso" },
    CM: { mtn_money: "mtn-cameroun" },
};

const base = (config: any) => (config.mode === "live" ? "https://app.paydunya.com/api/v2" : "https://app.paydunya.com/sandbox-api/v2");
const entetes = (config: any) => ({
    "Content-Type": "application/json",
    "PAYDUNYA-MASTER-KEY": config.masterKey,
    "PAYDUNYA-PRIVATE-KEY": config.privateKey,
    "PAYDUNYA-TOKEN": config.token,
});
const statut = (s: unknown): PayoutResponse["status"] => {
    const v = String(s || "").toLowerCase();
    return v === "success" ? "SUCCESS" : v === "failed" ? "FAILED" : "PENDING";
};

export const paydunya: Fournisseur = {
    cle: "paydunya",
    nom: "PayDunya",
    motif: /paydunya/i,
    verifieParNotreReference: false,
    cles: [{ champ: "masterKey", libelle: "clé maître" }, { champ: "privateKey", libelle: "clé privée" }, { champ: "token", libelle: "jeton" }],
    correspondant: (pays, operateur) => MODES[pays.toUpperCase()]?.[operateur] || null,

    async initier(config, d) {
        const mode = MODES[d.country.toUpperCase()]?.[d.operator];
        if (!mode) return refus(d, "OPERATEUR_INCONNU", `PayDunya ne dessert pas ${d.operator} en ${d.country}.`);
        if (!config.masterKey || !config.privateKey || !config.token) {
            return refus(d, "CLES_INCOMPLETES", "PayDunya exige la clé maître, la clé privée et le jeton : complétez la passerelle.");
        }
        // 1. La facture de deboursement ne deplace rien : une panne ici est un simple refus.
        let r1: Response;
        try {
            r1 = await fetch(`${base(config)}/disburse/get-invoice`, {
                method: "POST", headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS),
                body: JSON.stringify({ account_alias: numeroNational(d.phone), amount: Math.round(d.amount), withdraw_mode: mode, callback_url: URL_RAPPEL("paydunya") }),
            });
        } catch (e) {
            return refus(d, "INJOIGNABLE", injoignable("PayDunya", e).message, undefined, mode);
        }
        const j1 = await lireJson(r1);
        if (!r1.ok || j1.response_code !== "00" || !j1.disburse_token) {
            return refus(d, j1.response_code || `HTTP_${r1.status}`, j1.response_text || j1.description || "PayDunya a refusé la demande.", j1, mode);
        }
        const jeton = String(j1.disburse_token);
        // 2. L'envoi : a partir d'ici une panne reseau est une issue inconnue.
        let r2: Response;
        try {
            r2 = await fetch(`${base(config)}/disburse/submit-invoice`, {
                method: "POST", headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS),
                body: JSON.stringify({ disburse_invoice: jeton, disburse_id: d.reference }),
            });
        } catch (e) {
            throw injoignable("PayDunya", e);
        }
        const j2 = await lireJson(r2);
        if (!r2.ok || j2.response_code !== "00") {
            return { ...refus(d, j2.response_code || `HTTP_${r2.status}`, j2.response_text || j2.description || "PayDunya a refusé l'envoi.", j2, mode), providerReference: jeton };
        }
        return {
            providerReference: jeton,
            status: j2.status ? statut(j2.status) : "SUCCESS",
            providerCode: mode,
            providerTransactionId: j2.transaction_id || j2.provider_ref,
            rawData: j2,
        };
    },

    async verifier(config, jeton) {
        const r = await fetch(`${base(config)}/disburse/check-status`, {
            method: "POST", headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS),
            body: JSON.stringify({ disburse_invoice: jeton }),
        });
        const j = await lireJson(r);
        if (!r.ok || j.response_code !== "00") throw new Error(`PayDunya check-status : ${j.response_text || j.description || r.status}`);
        return { providerReference: jeton, status: statut(j.status), providerCode: j.withdraw_mode, providerTransactionId: j.transaction_id || j.disburse_tx_id, rawData: j };
    },
};
