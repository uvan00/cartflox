import { DELAI_MS, URL_RAPPEL, injoignable, lireJson, refus, type Fournisseur, type PayoutResponse } from "../types";

/**
 * Flutterwave « Transfers » v3 : POST /v3/transfers avec le code operateur en
 * `account_bank` et le numero en `account_number`, GET /v3/transfers/{id}.
 * Montant entier. Documentation : developer.flutterwave.com/docs/mobile-money
 */
const BANQUES: Record<string, Record<string, string>> = {
    CM: { mtn_money: "MTN", orange_money: "ORANGEMONEY" },
    CI: { mtn_money: "MTN", orange_money: "ORANGE", moov_money: "MOOV", wave: "WAVE" },
    SN: { orange_money: "ORANGEMONEY", wave: "WAVE" },
    BF: { orange_money: "ORANGEMONEY", mobicash: "MOBICASH" },
    GH: { mtn_money: "MTN", airtel_tigo: "AIRTELTIGO", vodafone_cash: "VODAFONE" },
    KE: { mpesa: "MPS" },
    RW: { mtn_money: "MTN" },
    TZ: { airtel_money: "AIRTEL", halopesa: "HALOPESA", tigo_pesa: "TIGO", vodacom: "VODACOM", mpesa: "VODACOM" },
    UG: { airtel_money: "AIRTEL", mtn_money: "MTN" },
};
const BASE = "https://api.flutterwave.com/v3";
const entetes = (config: any) => ({ "Content-Type": "application/json", Authorization: `Bearer ${config.secretKey}` });
const statut = (s: unknown): PayoutResponse["status"] => {
    const v = String(s || "").toUpperCase();
    if (["SUCCESSFUL", "SUCCESS", "COMPLETED"].includes(v)) return "SUCCESS";
    if (["FAILED", "REVERSED", "CANCELLED"].includes(v)) return "FAILED";
    return "PENDING";
};

export const flutterwave: Fournisseur = {
    cle: "flutterwave",
    nom: "Flutterwave",
    motif: /flutterwave/i,
    verifieParNotreReference: false,
    cles: [{ champ: "secretKey", libelle: "clé secrète" }],
    correspondant: (pays, operateur) => BANQUES[pays.toUpperCase()]?.[operateur] || null,

    async initier(config, d) {
        const pays = d.country.toUpperCase();
        const banque = BANQUES[pays]?.[d.operator];
        if (!banque) return refus(d, "OPERATEUR_INCONNU", `Flutterwave ne dessert pas ${d.operator} en ${pays}.`);
        let res: Response;
        try {
            res = await fetch(`${BASE}/transfers`, {
                method: "POST", headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS),
                body: JSON.stringify({
                    account_bank: banque, account_number: d.phone, amount: Math.round(d.amount), currency: d.currency.toUpperCase(),
                    narration: (d.description || "Transfert").slice(0, 100), reference: d.reference,
                    beneficiary_name: (d.recipientName || "Bénéficiaire").slice(0, 80), callback_url: URL_RAPPEL("flutterwave"),
                    meta: [{ sender: "Cartflox", sender_country: "CI", mobile_number: d.phone, beneficiary_country: pays }],
                }),
            });
        } catch (e) {
            throw injoignable("Flutterwave", e);
        }
        const j = await lireJson(res);
        if (!res.ok || j.status !== "success" || !j.data?.id) return refus(d, String(j.code || res.status), j.message || "Flutterwave a refusé le transfert.", j, banque);
        return { providerReference: String(j.data.id), status: statut(j.data.status), providerCode: banque, failureMessage: j.data.complete_message || undefined, rawData: j };
    },

    async verifier(config, id) {
        const res = await fetch(`${BASE}/transfers/${encodeURIComponent(id)}`, { headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS) });
        const j = await lireJson(res);
        if (!res.ok || !j.data) throw new Error(`Flutterwave transfert ${id} : ${j.message || res.status}`);
        return { providerReference: id, status: statut(j.data.status), failureMessage: j.data.complete_message || undefined, rawData: j };
    },
};
