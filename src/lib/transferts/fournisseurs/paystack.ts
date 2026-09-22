import { DELAI_MS, injoignable, lireJson, numeroLocal, refus, type Fournisseur, type PayoutResponse } from "../types";

/**
 * Paystack « Transfers » : un destinataire (transferrecipient) puis un
 * transfert depuis le solde, GET /transfer/{code}. Mobile Money au Ghana et
 * au Kenya ; montant en sous-unites. La confirmation OTP des transferts doit
 * etre desactivee dans le tableau de bord Paystack, sinon l'API repond `otp`.
 */
const CODES: Record<string, Record<string, { banque: string; devise: string }>> = {
    GH: { mtn_money: { banque: "MTN", devise: "GHS" }, vodafone_cash: { banque: "VOD", devise: "GHS" }, airtel_tigo: { banque: "ATL", devise: "GHS" } },
    KE: { mpesa: { banque: "MPESA", devise: "KES" } },
};
const BASE = "https://api.paystack.co";
const entetes = (config: any) => ({ "Content-Type": "application/json", Authorization: `Bearer ${config.secretKey}` });
const statut = (s: unknown): PayoutResponse["status"] => {
    const v = String(s || "").toLowerCase();
    if (v === "success") return "SUCCESS";
    if (["failed", "reversed", "rejected", "otp", "abandoned"].includes(v)) return "FAILED";
    return "PENDING";
};

export const paystack: Fournisseur = {
    cle: "paystack",
    nom: "Paystack",
    motif: /paystack/i,
    verifieParNotreReference: false,
    cles: [{ champ: "secretKey", libelle: "clé secrète" }],
    avertissement: "Paystack : désactivez la confirmation OTP des transferts dans votre tableau de bord Paystack, sinon chaque envoi est refusé.",
    correspondant: (pays, operateur) => CODES[pays.toUpperCase()]?.[operateur]?.banque || null,

    async initier(config, d) {
        const cible = CODES[d.country.toUpperCase()]?.[d.operator];
        if (!cible) return refus(d, "OPERATEUR_INCONNU", `Paystack ne dessert pas ${d.operator} en ${d.country}.`);
        // 1. Le destinataire : rien ne part encore, une panne est un simple refus.
        let r1: Response;
        try {
            r1 = await fetch(`${BASE}/transferrecipient`, {
                method: "POST", headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS),
                body: JSON.stringify({ type: "mobile_money", name: (d.recipientName || "Bénéficiaire").slice(0, 80), account_number: numeroLocal(d.phone), bank_code: cible.banque, currency: cible.devise }),
            });
        } catch (e) {
            return refus(d, "INJOIGNABLE", injoignable("Paystack", e).message, undefined, cible.banque);
        }
        const j1 = await lireJson(r1);
        if (!r1.ok || !j1.status || !j1.data?.recipient_code) return refus(d, String(r1.status), j1.message || "Paystack a refusé le destinataire.", j1, cible.banque);
        // 2. Le transfert : a partir d'ici une panne reseau est une issue inconnue.
        let r2: Response;
        try {
            r2 = await fetch(`${BASE}/transfer`, {
                method: "POST", headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS),
                body: JSON.stringify({ source: "balance", amount: Math.round(d.amount * 100), recipient: j1.data.recipient_code, reason: (d.description || "Transfert").slice(0, 100), reference: d.reference }),
            });
        } catch (e) {
            throw injoignable("Paystack", e);
        }
        const j2 = await lireJson(r2);
        if (!r2.ok || !j2.status || !j2.data?.transfer_code) return refus(d, String(r2.status), j2.message || "Paystack a refusé le transfert.", j2, cible.banque);
        const s = String(j2.data.status || "").toLowerCase();
        return {
            providerReference: String(j2.data.transfer_code),
            status: statut(s),
            providerCode: cible.banque,
            failureCode: s === "otp" ? "OTP_REQUIS" : undefined,
            failureMessage: s === "otp" ? "Paystack demande une confirmation OTP : désactivez-la pour les transferts dans votre tableau de bord Paystack." : undefined,
            rawData: j2,
        };
    },

    async verifier(config, code) {
        const res = await fetch(`${BASE}/transfer/${encodeURIComponent(code)}`, { headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS) });
        const j = await lireJson(res);
        if (!res.ok || !j.data) throw new Error(`Paystack transfert ${code} : ${j.message || res.status}`);
        return { providerReference: code, status: statut(j.data.status), failureMessage: j.data.failures ? JSON.stringify(j.data.failures).slice(0, 200) : undefined, rawData: j };
    },
};
