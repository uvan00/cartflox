import type { Fournisseur } from "./types";
import { pawapay } from "./fournisseurs/pawapay";
import { paydunya } from "./fournisseurs/paydunya";
import { hub2 } from "./fournisseurs/hub2";
import { notchpay } from "./fournisseurs/notchpay";
import { monetbill } from "./fournisseurs/monetbill";
import { flutterwave } from "./fournisseurs/flutterwave";
import { paystack } from "./fournisseurs/paystack";
import { fedapay } from "./fournisseurs/fedapay";
import { feexpay } from "./fournisseurs/feexpay";

/**
 * Tous les fournisseurs qui savent envoyer de l'argent, dans l'ordre de
 * preference quand plusieurs passerelles d'un meme espace desservent le meme
 * operateur. Absents, et pourquoi : CinetPay (mot de passe de transfert, IP a
 * autoriser et confirmation par e-mail, documentation injoignable), Kkiapay
 * (aucune API publique d'envoi vers un tiers), Stripe, Coinbase et Cryptomus
 * (cartes et crypto, pas de Mobile Money sortant), Qosic, PayPlus, LengoPay
 * (aucune documentation d'envoi).
 */
export const FOURNISSEURS: Fournisseur[] = [pawapay, paydunya, hub2, notchpay, monetbill, flutterwave, paystack, fedapay, feexpay];

export function fournisseurDe(gateway: { name?: string | null } | null | undefined): Fournisseur | null {
    const nom = String(gateway?.name || "");
    return FOURNISSEURS.find((f) => f.motif.test(nom)) || null;
}
