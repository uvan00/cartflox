/**
 * Cle de l'orchestrateur (fabrique d'adaptateurs, webhooks) a partir du NOM
 * d'une passerelle en base : « Hub2 Côte d'Ivoire » -> « hub2 »,
 * « Flutterwave » -> « flutterwave » (et non « wave »), « Stripe » -> « stripe ».
 *
 * Une seule regle, partagee par l'initiation et la finalisation : la
 * finalisation derivait la cle du champ `provider` de la transaction, qui
 * porte le nom affiche de la carte pays, et la fabrique ne la connaissait pas.
 */
const FOURNISSEURS = [
    "paydunya", "pawapay", "flutterwave", "paystack", "cinetpay", "stripe",
    "kkiapay", "coinbase", "fedapay", "feexpay", "notchpay", "cryptomus",
    "qosic", "monetbill", "payplus", "hub2", "lengopay",
    "paytech", "onepay", "djamo", "ipay",
    // « wave » en dernier : « flutterwave » le contient.
    "wave",
];

export function detectProviderKey(gatewayName: string): string {
    const name = String(gatewayName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const p of FOURNISSEURS) {
        if (name.includes(p)) return p;
    }
    return name;
}
