import { DELAI_MS, injoignable, lireJson, prenomNom, refus, type Fournisseur, type PayoutResponse } from "../types";

/**
 * FedaPay « Payouts » : on cree le depot (POST /v1/payouts) puis on le lance
 * (PUT /v1/payouts/start). FedaPay detecte l'operateur d'apres le numero ;
 * l'etat se lit sur GET /v1/payouts/{id} : pending, started, processing, sent,
 * failed. Documentation : docs.fedapay.com/api-reference/payouts
 */
const PAYS = new Set(["BJ", "TG", "CI", "SN", "NE", "BF", "ML", "GN"]);
const OPERATEURS = new Set(["mtn_money", "moov_money", "orange_money", "wave", "tmoney", "free_money", "celtiis", "expresso"]);
const base = (config: any) => (config.mode === "live" ? "https://api.fedapay.com/v1" : "https://sandbox-api.fedapay.com/v1");
const entetes = (config: any) => ({ "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${config.apiKey}` });
const objet = (j: any) => j?.["v1/payout"] || j?.payout || j;
const statut = (s: unknown): PayoutResponse["status"] => {
    const v = String(s || "").toLowerCase();
    if (v === "sent") return "SUCCESS";
    if (["failed", "canceled", "cancelled"].includes(v)) return "FAILED";
    return "PENDING";
};

export const fedapay: Fournisseur = {
    cle: "fedapay",
    nom: "FedaPay",
    motif: /fedapay/i,
    verifieParNotreReference: false,
    cles: [{ champ: "apiKey", libelle: "clé API" }],
    correspondant: (pays, operateur) => (PAYS.has(pays.toUpperCase()) && OPERATEURS.has(operateur) ? "mobile_money" : null),

    async initier(config, d) {
        const pays = d.country.toUpperCase();
        if (!PAYS.has(pays) || !OPERATEURS.has(d.operator)) return refus(d, "OPERATEUR_INCONNU", `FedaPay ne dessert pas ${d.operator} en ${pays}.`);
        const { prenom, nom } = prenomNom(d.recipientName);
        // 1. La creation ne deplace rien : une panne est un simple refus.
        let r1: Response;
        try {
            r1 = await fetch(`${base(config)}/payouts`, {
                method: "POST", headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS),
                body: JSON.stringify({
                    amount: Math.round(d.amount), currency: { iso: d.currency.toUpperCase() }, mode: "mobile_money",
                    description: (d.description || "Transfert").slice(0, 100), merchant_reference: d.reference,
                    customer: { firstname: prenom, lastname: nom, email: process.env.MAIL_FROM || "noreply@example.com", phone_number: { number: `+${d.phone}`, country: pays } },
                }),
            });
        } catch (e) {
            return refus(d, "INJOIGNABLE", injoignable("FedaPay", e).message);
        }
        const j1 = await lireJson(r1);
        const cree = objet(j1);
        if (!r1.ok || !cree?.id) return refus(d, String(r1.status), j1.message || j1.error || "FedaPay a refusé la création du dépôt.", j1);
        const id = String(cree.id);
        // 2. Le lancement : a partir d'ici une panne reseau est une issue inconnue.
        let r2: Response;
        try {
            r2 = await fetch(`${base(config)}/payouts/start`, {
                method: "PUT", headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS),
                body: JSON.stringify([{ id: cree.id, phone_number: { number: `+${d.phone}`, country: pays } }]),
            });
        } catch (e) {
            throw injoignable("FedaPay", e);
        }
        const j2 = await lireJson(r2);
        if (!r2.ok) return { ...refus(d, String(r2.status), j2.message || j2.error || "FedaPay a refusé le lancement du dépôt.", j2), providerReference: id };
        const liste: any[] = Array.isArray(j2) ? j2 : Array.isArray(j2["v1/payouts"]) ? j2["v1/payouts"] : [objet(j2)];
        const lance = liste.find((p) => String(p?.id) === id) || liste[0] || {};
        return { providerReference: id, status: statut(lance.status), providerCode: "mobile_money", failureCode: lance.last_error_code && lance.last_error_code !== "NO_ERROR" ? lance.last_error_code : undefined, rawData: j2 };
    },

    async verifier(config, id) {
        const res = await fetch(`${base(config)}/payouts/${encodeURIComponent(id)}`, { headers: entetes(config), signal: AbortSignal.timeout(DELAI_MS) });
        const j = await lireJson(res);
        const p = objet(j);
        if (!res.ok || !p?.id) throw new Error(`FedaPay dépôt ${id} : ${j.message || res.status}`);
        return { providerReference: id, status: statut(p.status), failureCode: p.last_error_code && p.last_error_code !== "NO_ERROR" ? p.last_error_code : undefined, rawData: j };
    },
};
