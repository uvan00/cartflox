import { PawaPayAdapter } from "@/lib/orchestrator/adapters/pawapay.adapter";
import type { Fournisseur } from "../types";

/** PawaPay : POST /v2/payouts, verifie par NOTRE reference (payoutId). 17 pays. */
export const pawapay: Fournisseur = {
    cle: "pawapay",
    nom: "PawaPay",
    motif: /pawapay/i,
    verifieParNotreReference: true,
    cles: [{ champ: "apiKey", libelle: "jeton API" }],
    correspondant: (pays, operateur) => PawaPayAdapter.correspondant(pays, operateur),
    initier: (config, demande) => new PawaPayAdapter(config).initiatePayout(demande),
    verifier: (config, reference) => new PawaPayAdapter(config).verifyPayout(reference),
};
