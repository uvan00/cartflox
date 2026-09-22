/**
 * L'adresse de la page de paiement.
 *
 * Forme courte, sur le domaine dedie : checkout.exemple.com/<id>. Plus courte
 * a lire, a dicter et a scanner qu'un /checkout/ perdu au milieu du site.
 *
 * L'ancienne forme cartflox.com/checkout/<id> reste servie et le restera : des
 * liens sont deja partis en e-mail, en WhatsApp et dans des integrations
 * marchandes. Ils ne doivent jamais casser.
 *
 * Le pays et le numero sont facultatifs : quand le marchand les connait deja,
 * le client trouve le formulaire rempli et n'a plus qu'a confirmer.
 */
const HOTE = (process.env.CHECKOUT_PUBLIC_URL || "https://checkout.exemple.com").replace(/\/+$/, "");

export function lienCheckout(
    id: string,
    options?: { pays?: string | null; tel?: string | null },
): string {
    const u = new URL(`${HOTE}/${id}`);
    const pays = (options?.pays || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(pays)) u.searchParams.set("country", pays);
    const tel = (options?.tel || "").replace(/\D/g, "");
    if (tel.length >= 6 && tel.length <= 15) u.searchParams.set("phone", tel);
    return u.toString();
}
