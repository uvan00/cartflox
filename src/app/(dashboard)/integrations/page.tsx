"use client";

import { useEffect, useState } from "react";
import { MARQUE } from "@/lib/marque";
import Link from "next/link";
import { Link2, Globe, Paintbrush, Download, Terminal, Check } from "lucide-react";
import { getApiConfig } from "@/lib/actions/security";
import { etatEnvironnement } from "@/lib/actions/environnement";
import { Page, Bloc, Onglets, Aide, Code, Bouton, LienCarte } from "@/components/dashboard/kit";

/**
 * Integrations : cinq facons d'encaisser, de la plus simple a la plus
 * technique. Chaque panneau donne le code pret a coller avec les cles du
 * marchand deja remplies.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

type Onglet = "lien" | "widget" | "softpay" | "woocommerce" | "api";
const ONGLETS = [
    { cle: "lien" as Onglet, label: "Sans code", icone: Link2 },
    { cle: "widget" as Onglet, label: "Widget", icone: Globe },
    { cle: "softpay" as Onglet, label: "SoftPay", icone: Paintbrush },
    { cle: "woocommerce" as Onglet, label: "WooCommerce", icone: Download },
    { cle: "api" as Onglet, label: "API", icone: Terminal },
];

const CHOIX = [
    { cle: "lien" as Onglet, titre: "Un lien à partager", pour: "Pas de site, ou pas de développeur", texte: "Créez un lien à montant fixe, collez-le dans un bouton ou envoyez-le par WhatsApp.", logo: "/logos/whatsapp.svg" },
    { cle: "widget" as Onglet, titre: "Le widget", pour: "Un site vitrine, une page produit", texte: `Deux lignes de code : un bouton ouvre la page de paiement ${MARQUE} par-dessus votre site.` },
    { cle: "softpay" as Onglet, titre: "SoftPay", pour: "Un site avec sa propre charte", texte: "Le formulaire de paiement dans votre page, à vos couleurs ou dessiné par vous." },
    { cle: "woocommerce" as Onglet, titre: "WooCommerce", pour: "Une boutique WordPress", texte: "Le plugin officiel : installez, collez votre clé, vos clients paient en Mobile Money.", logo: "/logos/woocommerce.svg" },
    { cle: "api" as Onglet, titre: "L'API", pour: "Une application sur mesure", texte: "Créez des sessions de paiement depuis votre serveur, recevez les confirmations par webhook." },
];

export default function IntegrationsPage() {
    const [onglet, setOnglet] = useState<Onglet>("lien");
    const [pub, setPub] = useState("af_live_pub_VOTRE_CLE");
    const [sec, setSec] = useState("af_live_sec_VOTRE_CLE");
    // En sandbox, les exemples portent les cles de TEST : ce qui est colle ne peut pas encaisser pour de vrai.
    useEffect(() => {
        Promise.all([getApiConfig(), etatEnvironnement()]).then(([c, e]: any[]) => {
            const sandbox = !!e?.vueTest;
            const pub = sandbox ? c?.testPublicKey : c?.publicKey;
            const sec = sandbox ? c?.testSecretKey : c?.secretKey;
            if (pub) setPub(pub);
            if (sec && (sandbox || c?._plaintext !== false)) setSec(sec);
        }).catch(() => { });
    }, []);

    return (
        <Page titre="Intégrations" sousTitre="Cinq façons d'encaisser, de la plus simple à la plus technique. Vos clés sont déjà remplies dans les exemples." large>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                {CHOIX.map((c) => { const actif = onglet === c.cle; return (
                    <button key={c.cle} type="button" onClick={() => setOnglet(c.cle)} className="rounded-xl p-4 text-left transition-colors" style={{ background: actif ? "rgba(18,165,148,0.08)" : "var(--dt-card-bg)", border: `1px solid ${actif ? "rgba(18,165,148,0.5)" : "var(--dt-border)"}` }}>
                        <div className="mb-1 flex items-center justify-between"><p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--dt-text-primary)" }}>{"logo" in c && c.logo && <img src={c.logo} alt="" className="h-5 w-5" />}{c.titre}</p>{actif && <Check className="h-4 w-4 text-teal-400" />}</div>
                        <p className="text-[11px] font-medium" style={{ color: "#12a594" }}>{c.pour}</p>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--dt-text-muted)" }}>{c.texte}</p>
                    </button>
                ); })}
            </div>
            <Onglets items={ONGLETS} actif={onglet} onChange={setOnglet} />

            {onglet === "lien" && (
                <Bloc titre="Lien de paiement : aucun code" sousTitre="Fonctionne partout : Wix, Webflow, Shopify, WordPress, Linktree, WhatsApp, e-mail.">
                    <ol className="mb-4 space-y-1.5 text-sm" style={{ color: "var(--dt-text-secondary)" }}>
                        <li>1. Créez un lien avec un titre et un montant.</li>
                        <li>2. Copiez son adresse ({APP_URL}/pay/…).</li>
                        <li>3. Collez-la dans un bouton de votre site, ou envoyez-la à votre client.</li>
                    </ol>
                    <div className="mb-4 flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--dt-text-muted)" }}>
                        {[["/logos/shopify.svg", "Shopify"], ["/logos/wordpress.svg", "WordPress"], ["/logos/whatsapp.svg", "WhatsApp"]].map(([src, nom]) => <span key={nom} className="flex items-center gap-1.5"><img src={src} alt="" className="h-4 w-4" />{nom}</span>)}
                        <span>et tout site où l&apos;on peut coller un lien.</span>
                    </div>
                    <Code>{`<a href="${APP_URL}/pay/VOTRE_LIEN"
   style="display:inline-block;padding:14px 28px;border-radius:999px;background:#1a1a1c;color:#fff;font-weight:600;text-decoration:none">
  Payer 25 000 F
</a>`}</Code>
                    <div className="mt-4"><Link href="/payment-links/new"><Bouton icone={Link2}>Créer un lien de paiement</Bouton></Link></div>
                </Bloc>
            )}

            {onglet === "widget" && (
                <Bloc titre="Widget : deux lignes sur votre site" sousTitre={`Le bouton ouvre la page de paiement ${MARQUE} par-dessus votre site (ou la redirige, au choix). Utilise votre clé publique uniquement.`}>
                    <Code>{`<script src="${APP_URL}/cartflox.js"></script>
<script>
  Cartflox.configure({ publicKey: "${pub}", mode: "popup" });
</script>

<button data-cartflox-amount="5000" data-cartflox-currency="XOF" data-cartflox-description="Mon produit">
  Payer avec Mobile Money
</button>`}</Code>
                    <Aide>Le callback <code>onSuccess</code> s&apos;exécute dans le navigateur du client : validez la commande à réception du <Link href="/developer" className="underline">webhook</Link>, jamais sur ce seul signal.</Aide>
                </Bloc>
            )}

            {onglet === "softpay" && (
                <Bloc titre="SoftPay : le paiement dans votre page, à vos couleurs" sousTitre="Choix de l'opérateur, numéro, code OTP, redirection Wave et suivi : tout se passe dans votre page. Stylable par variables CSS, ou entièrement dessiné par vous en mode headless."
                    action={<a href={`${APP_URL}/softpay-demo`} target="_blank" rel="noopener noreferrer"><Bouton variante="secondaire">Essayer la démo</Bouton></a>}>
                    <Code>{`<div id="paiement"></div>
<script src="${APP_URL}/cartflox-softpay.js"></script>
<script>
  Cartflox.softpay.configure({ publicKey: "${pub}" });
  Cartflox.softpay.mount({
    container: "#paiement",
    amount: 5000,
    currency: "XOF",
    country: "ci",
    metadata: { order_id: "1042" },
    theme: { accent: "#1a1a1c", "accent-text": "#ffffff", radius: "12px" },
    onSuccess: function (r) { /* merci ; validez côté serveur */ }
  });
</script>`}</Code>
                    <p className="mt-3 text-xs" style={{ color: "var(--dt-text-muted)" }}>Variables : <code>--cf-accent</code>, <code>--cf-accent-text</code>, <code>--cf-bg</code>, <code>--cf-text</code>, <code>--cf-muted</code>, <code>--cf-border</code>, <code>--cf-field</code>, <code>--cf-radius</code>, <code>--cf-font</code>. Mode headless et détails dans la <a href={`${APP_URL}/docs/integrations/softpay/`} target="_blank" rel="noopener noreferrer" className="underline">documentation</a>.</p>
                </Bloc>
            )}

            {onglet === "woocommerce" && (
                <Bloc titre={<span className="flex items-center gap-2"><img src="/logos/woocommerce.svg" alt="" className="h-6 w-6" /> WooCommerce : le plugin officiel</span>}
                    sousTitre="Version 4.0.0. Le client paie en Mobile Money ou par carte, la commande passe en « payée » toute seule, et tout se règle depuis WooCommerce."
                    action={<a href={`${APP_URL}/downloads/cartflox-payment.zip`} download><Bouton icone={Download}>Télécharger le plugin</Bouton></a>}>
                    <ol className="space-y-2 text-sm" style={{ color: "var(--dt-text-secondary)" }}>
                        {[
                            "Dans WordPress (Extensions, Ajouter, Téléverser une extension) : choisissez le fichier .zip, puis Activer.",
                            "WooCommerce : Réglages, Paiements, Cartflox, Gérer.",
                            "Collez votre clé secrète ci-dessous, puis Enregistrer : le plugin vérifie la clé et déclare lui-même votre webhook.",
                            "Le panneau « État de la connexion » confirme que tout est en place. Vos clients peuvent payer.",
                        ].map((t, i) => <li key={i} className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-primary)" }}>{i + 1}</span>{t}</li>)}
                    </ol>
                    <div className="mt-4"><Code>{sec}</Code></div>
                    <div className="mt-5">
                        <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--dt-text-primary)" }}>Ce que vous réglez dans WooCommerce</p>
                        <ul className="grid grid-cols-1 gap-1.5 text-[12.5px] sm:grid-cols-2" style={{ color: "var(--dt-text-muted)" }}>
                            {[
                                "Titre, description, logos affichés et leur taille",
                                "Texte du bouton de commande et message de remerciement",
                                "Statut des commandes en attente et une fois payées",
                                "Vérification automatique et annulation après un délai",
                                "Frais fixes ou en pourcentage, montants minimum et maximum",
                                "Devises acceptées, journal détaillé, adresses de retour",
                            ].map((x) => <li key={x} className="flex gap-2"><span style={{ color: "var(--dt-brand)" }}>•</span>{x}</li>)}
                        </ul>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <LienCarte href={`${APP_URL}/docs/integrations/woocommerce/`} externe icone={Terminal} titre="Guide WooCommerce" texte="Installation, réglages, dépannage et hooks pour développeurs." />
                        <LienCarte href="/transactions" icone={Terminal} titre="Suivre les paiements" texte="Chaque commande WooCommerce apparaît ici, avec son opérateur et sa référence." />
                    </div>
                    <div className="mt-4"><Aide ton="attention">Votre boutique doit être en HTTPS pour recevoir les webhooks. Sinon les commandes sont confirmées au retour du client et par la vérification automatique du plugin.</Aide></div>
                </Bloc>
            )}

            {onglet === "api" && (
                <Bloc titre="API : depuis votre serveur" sousTitre="Créez une session, redirigez votre client vers l'URL renvoyée, recevez la confirmation par webhook.">
                    <Code>{`curl -X POST ${APP_URL}/api/v1/checkout/sessions \\
  -H "Authorization: Bearer ${sec}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 5000,
    "currency": "XOF",
    "customer_email": "client@example.com",
    "success_url": "https://monsite.com/merci",
    "metadata": { "order_id": "1042" }
  }'`}</Code>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <LienCarte href={`${APP_URL}/docs/`} externe icone={Terminal} titre="Documentation complète" texte="Endpoints, webhooks signés, exemples Node, PHP, Python." />
                        <LienCarte href="/developer" icone={Terminal} titre="Vos clés et votre webhook" texte="Retrouvez ou régénérez vos clés, configurez l'adresse de réception." />
                    </div>
                </Bloc>
            )}
        </Page>
    );
}
