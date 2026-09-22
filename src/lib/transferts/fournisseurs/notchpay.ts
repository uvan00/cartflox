import { DELAI_MS, injoignable, lireJson, refus, type Fournisseur, type PayoutResponse } from "../types";

/**
 * Notch Pay « Transfers » (Cameroun) : POST /transfers avec le beneficiaire en
 * ligne, GET /transfers/{id}. Deux cles : la publique en Authorization, la
 * PRIVEE en X-Grant, obligatoire pour faire sortir de l'argent. L'adresse IP du
 * serveur doit etre autorisee dans le tableau de bord Notch Pay.
 * Documentation : developer.notchpay.co/api-reference/transfers
 */
const CANAUX: Record<string, Record<string, string>> = {
    CM: { mtn_money: "cm.mtn", orange_money: "cm.orange", express_union: "cm.eu" },
};
const BASE = "https://api.notchpay.co";
const entetes = (config: any) => ({ "Content-Type": "application/json", Accept: "application/json", Authorization: config.publicKey, "X-Grant": config.privateKey });
const statut = (s: unknown): PayoutResponse["status"] => {
    const v = String(s || "").toLowerCase();
    if (["complete", "completed", "success", "successful"].includes(v)) return "SUCCESS";
    if (["failed", "canceled", "cancelled", "rejected", "expired"].includes(v)) return "FAILED";
    return "PENDING";
};

export const notchpay: Fournisseur = {
    cle: "notchpay",
    nom: "Notch Pay",
    motif: /notch/i,
    verifieParNotreReference: false,
    cles: [{ champ: "publicKey", libelle: "clé publique" }, { champ: "privateKey", libelle: "clé privée (X-Grant)" }],
    avertissement: "Notch Pay exige la clé privée (X-Grant) dans la passerelle et l'adresse IP du serveur Cartflox autorisée dans votre tableau de bord Notch Pay.",
    correspondant: (pays, operateur) => CANAUX[pays.toUpperCase()]?.[operateur] || null,

    async initier(config, d) {
        const canal = CANAUX[d.country.toUpperCase()]?.[d.operator];
        if (!canal) return refus(d, "OPERATEUR_INCONNU", `Notch Pay ne dessert pas ${d.operator} en ${d.country}.`);
        if (!config.privateKey) return refus(d, "CLE_PRIVEE_MANQUANTE", "Notch Pay exige la clé privée (X-Grant) pour envoyer de l'argent : ajoutez-la dans la passerelle.");
        let res: Response;
        try {
            res = await fetch(`${BASE}/transfers`, {
                method: "POST", headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS),
                body: JSON.stringify({
                    amount: Math.round(d.amount), currency: d.currency.toUpperCase(),
                    beneficiary_data: { name: (d.recipientName || "Bénéficiaire").slice(0, 80), phone: `+${d.phone}` },
                    channel: canal, description: (d.description || "Transfert").slice(0, 120), reference: d.reference,
                }),
            });
        } catch (e) {
            throw injoignable("Notch Pay", e);
        }
        const j = await lireJson(res);
        const t = j.transfer || j.data;
        if (!res.ok || !t?.id) return refus(d, String(j.code || res.status), j.message || "Notch Pay a refusé le transfert.", j, canal);
        return { providerReference: String(t.id), status: statut(t.status), providerCode: canal, rawData: j };
    },

    async verifier(config, id) {
        const res = await fetch(`${BASE}/transfers/${encodeURIComponent(id)}`, { headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS) });
        const j = await lireJson(res);
        if (!res.ok) throw new Error(`Notch Pay transfert ${id} : ${j.message || res.status}`);
        const t = j.transfer || j.data || j;
        return { providerReference: id, status: statut(t.status), failureMessage: t.failure_reason || t.reason, rawData: j };
    },
};
