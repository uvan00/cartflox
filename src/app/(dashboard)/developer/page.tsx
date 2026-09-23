"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Webhook, Activity, BookOpen, Eye, EyeOff, RefreshCw, Puzzle, FlaskConical, Send, ListChecks } from "lucide-react";
import { goeyToast } from "goey-toast";
import { getApiConfig, rotateApiKeys, updateWebhookUrl } from "@/lib/actions/security";
import { getActiviteApi } from "@/lib/actions/compte";
import { listerLivraisons, renvoyerLivraison, definirEvenementsWebhook } from "@/lib/actions/webhooks-livraisons";
import { etatEnvironnement } from "@/lib/actions/environnement";
import { Page, Bloc, Champ, Entree, Bouton, Copier, Pastille, Aide, Vide, Squelette, LienCarte, fmtDate, fmtMontant } from "@/components/dashboard/kit";

/**
 * API & Logs : les identifiants d'integration (production ET test), le
 * webhook (adresses, evenements choisis, journal des livraisons avec renvoi),
 * et ce qui se passe reellement sur l'API du marchand.
 */
const SITE_PUBLIC = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const STATUT: Record<string, { label: string; couleur: string }> = {
    SUCCESS: { label: "Réussi", couleur: "#12a594" }, PENDING: { label: "En attente", couleur: "#f59e0b" }, FAILED: { label: "Échoué", couleur: "#f87171" },
    CANCELLED: { label: "Annulé", couleur: "#94a3b8" }, REFUNDED: { label: "Remboursé", couleur: "#a78bfa" },
};

const EVENEMENTS: { cle: string; label: string }[] = [
    { cle: "payment.completed", label: "Paiement réussi" },
    { cle: "payment.failed", label: "Paiement échoué" },
    { cle: "payment.cancelled", label: "Paiement abandonné ou annulé" },
    { cle: "payment.updated", label: "Autre changement (remboursement, retour en attente)" },
    { cle: "transfer.succeeded", label: "Transfert effectué" },
    { cle: "transfer.failed", label: "Transfert échoué" },
];

const STATUT_LIVRAISON: Record<string, { label: string; couleur: string }> = {
    delivered: { label: "Reçu", couleur: "#12a594" },
    pending: { label: "À renvoyer", couleur: "#f59e0b" },
    failed: { label: "Abandonné", couleur: "#f87171" },
};

function Cle({ label, valeur, couleur, secrete, aide }: { label: string; valeur: string | null | undefined; couleur: string; secrete?: boolean; aide?: string }) {
    const [voir, setVoir] = useState(false);
    const masque = (k: string) => (k ? k.slice(0, 16) + "•".repeat(12) + k.slice(-4) : "");
    if (!valeur) return <Champ label={label} aide={aide}><code className="block rounded-lg px-3 py-2 font-mono text-xs" style={{ background: "var(--dt-input-bg)", border: "1px solid var(--dt-input-border)", color: "var(--dt-text-muted)" }}>indisponible</code></Champ>;
    return (
        <Champ label={label} aide={aide}>
            <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 font-mono text-xs" style={{ background: "var(--dt-input-bg)", border: "1px solid var(--dt-input-border)", color: couleur }}>{secrete && !voir ? masque(valeur) : valeur}</code>
                {secrete && <button type="button" onClick={() => setVoir(!voir)} className="rounded-md p-2" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-muted)" }} aria-label="Afficher">{voir ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
                <Copier valeur={valeur} />
            </div>
        </Champ>
    );
}

export default function ApiLogsPage() {
    const [cfg, setCfg] = useState<any>(null);
    const [webhook, setWebhook] = useState("");
    const [webhookTest, setWebhookTest] = useState("");
    const [evenements, setEvenements] = useState<string[]>(EVENEMENTS.map((e) => e.cle));
    const [activite, setActivite] = useState<any | null>(null);
    const [livraisons, setLivraisons] = useState<any[] | null>(null);
    const [occupe, setOccupe] = useState("");
    // Identite non verifiee : l'espace reste en sandbox, seules les cles de test existent pour lui.
    const [verrouille, setVerrouille] = useState<boolean | null>(null);

    const charger = () => getApiConfig().then((c: any) => {
        setCfg(c);
        setWebhook(c?.webhookUrl || "");
        setWebhookTest(c?.testWebhookUrl || "");
        setEvenements(Array.isArray(c?.webhookEvents) && c.webhookEvents.length ? c.webhookEvents : EVENEMENTS.map((e) => e.cle));
    }).catch(() => setCfg(null));
    const chargerLivraisons = () => listerLivraisons({ limite: 50 }).then(setLivraisons).catch(() => setLivraisons([]));
    useEffect(() => {
        charger();
        chargerLivraisons();
        etatEnvironnement().then((e) => setVerrouille(!!e?.verrouille)).catch(() => setVerrouille(false));
        getActiviteApi().then(setActivite).catch(() => setActivite({ total30: 0, reussies30: 0, parSource: [], recentes: [] }));
    }, []);

    async function tourner(quoi: "live" | "test") {
        const message = quoi === "test"
            ? "Régénérer vos clés de test ? Les anciennes cessent de fonctionner immédiatement."
            : "Régénérer vos clés de production ? Les anciennes cessent de fonctionner immédiatement : vos intégrations (site, WooCommerce, API) devront utiliser les nouvelles.";
        if (!window.confirm(message)) return;
        setOccupe(quoi === "test" ? "rot-test" : "rot");
        const r: any = await rotateApiKeys(quoi).catch((e) => ({ success: false, error: e?.message }));
        setOccupe("");
        if (r?.success === false) { goeyToast.error(r.error || "Échec"); return; }
        goeyToast.success(quoi === "test" ? "Nouvelles clés de test générées" : "Nouvelles clés générées"); charger();
    }
    async function sauverWebhook(mode: "live" | "test") {
        const valeur = (mode === "test" ? webhookTest : webhook).trim();
        if (valeur && !/^https:\/\//.test(valeur)) { goeyToast.error("L'adresse doit commencer par https://"); return; }
        setOccupe(mode === "test" ? "wh-test" : "wh");
        const r = await updateWebhookUrl(valeur, mode);
        setOccupe("");
        r.success ? goeyToast.success(valeur ? "Webhook enregistré" : "Webhook retiré") : goeyToast.error(r.error || "Échec");
    }
    async function sauverEvenements(liste: string[]) {
        setEvenements(liste);
        const r = await definirEvenementsWebhook(liste);
        if (!r.ok) { goeyToast.error(r.message || "Échec"); charger(); }
    }
    async function renvoyer(id: string) {
        setOccupe(`re-${id}`);
        const r: any = await renvoyerLivraison(id).catch(() => ({ ok: false, message: "Échec" }));
        setOccupe("");
        r.ok ? (r.livraison?.status === "delivered" ? goeyToast.success(r.message || "Reçu") : goeyToast.error(r.message || "Non reçu")) : goeyToast.error(r.message || "Échec");
        chargerLivraisons();
    }

    return (
        <Page titre="API et journaux" sousTitre="Vos identifiants d'intégration, l'adresse qui reçoit vos confirmations de paiement, et l'activité réelle de votre API." large>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Bloc titre={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4" /> Clés de production</span>} sousTitre={verrouille ? "Elles apparaîtront ici une fois votre identité vérifiée. D'ici là, votre espace est en sandbox et fonctionne avec les clés de test." : "La clé publique peut figurer dans une page web (widget, SoftPay). La clé secrète reste sur votre serveur : elle crée des paiements et signe vos webhooks."}
                    action={verrouille ? undefined : <Bouton variante="secondaire" icone={RefreshCw} chargement={occupe === "rot"} onClick={() => tourner("live")}>Régénérer</Bouton>}>
                    {cfg === null || verrouille === null ? <Squelette lignes={2} /> : verrouille ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-3 text-[12.5px]" style={{ background: "var(--dt-item-hover)", color: "var(--dt-text-secondary)" }}>
                            <span className="inline-flex items-center gap-2"><FlaskConical className="h-4 w-4" style={{ color: "#b45309" }} /> Sandbox tant que l'espace n&apos;est pas vérifiée.</span>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <Cle label="Clé publique" valeur={cfg.publicKey} couleur="#60a5fa" />
                            <Cle label="Clé secrète" valeur={cfg._plaintext === false ? null : cfg.secretKey} couleur="#0bd8b6" secrete aide={cfg._plaintext === false ? "Cette clé a été créée avant le chiffrement : régénérez-la pour pouvoir la relire." : "Ne la partagez jamais, ne la mettez jamais dans une page web."} />
                            <p className="text-[11px] break-words" style={{ color: "var(--dt-text-muted)" }}>Identifiant d&apos;application : <code className="font-mono break-all">{cfg.applicationId}</code>, dernière rotation : {fmtDate(cfg.lastRotationAt) || "jamais"}</p>
                        </div>
                    )}
                </Bloc>

                <Bloc titre={<span className="flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Clés de test</span>} sousTitre="Même API, mêmes routes : avec ces clés, aucun agrégateur n'est appelé, la page de paiement propose de simuler le succès ou l'échec, et vos webhooks arrivent avec livemode: false. Les données de test restent à l'écart de vos statistiques et sont effacées après 90 jours."
                    action={<Bouton variante="secondaire" icone={RefreshCw} chargement={occupe === "rot-test"} onClick={() => tourner("test")}>Régénérer</Bouton>}>
                    {cfg === null ? <Squelette lignes={2} /> : (
                        <div className="space-y-3">
                            <Cle label="Clé publique de test" valeur={cfg.testPublicKey} couleur="#b45309" />
                            <Cle label="Clé secrète de test" valeur={cfg.testSecretKey} couleur="#b45309" secrete aide="Utilisable sans vérification d'identité, dès aujourd'hui, pour construire votre intégration." />
                            <p className="text-[11px]" style={{ color: "var(--dt-text-muted)" }}>Pour voir les paiements de test dans ce tableau de bord : interrupteur « Sandbox » en haut de page. Il ne bloque jamais vos paiements réels : ce sont les clés qui font le monde d'un paiement.</p>
                        </div>
                    )}
                </Bloc>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Bloc titre={<span className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhook</span>} sousTitre="À chaque changement de statut, Cartflox envoie un message signé à cette adresse. C'est ce qui permet à votre site de valider une commande sans intervention.">
                    <div className="space-y-4">
                        <Champ label="Adresse de production (https)">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="min-w-0 flex-1"><Entree value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://monsite.com/webhooks/cartflox" /></div>
                                <Bouton chargement={occupe === "wh"} onClick={() => sauverWebhook("live")}>Enregistrer</Bouton>
                            </div>
                        </Champ>
                        <Champ label="Adresse de test (facultative)" aide="Sans adresse de test, les événements de test vont à l'adresse de production, avec livemode: false.">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="min-w-0 flex-1"><Entree value={webhookTest} onChange={(e) => setWebhookTest(e.target.value)} placeholder="https://staging.monsite.com/webhooks/cartflox" /></div>
                                <Bouton variante="secondaire" chargement={occupe === "wh-test"} onClick={() => sauverWebhook("test")}>Enregistrer</Bouton>
                            </div>
                        </Champ>
                        <Champ label="Événements envoyés">
                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                {EVENEMENTS.map((e) => {
                                    const coche = evenements.includes(e.cle);
                                    return (
                                        <label key={e.cle} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[12.5px]" style={{ color: "var(--dt-text-secondary)", background: coche ? "var(--dt-item-hover)" : "transparent" }}>
                                            <input type="checkbox" className="mt-0.5" checked={coche} onChange={() => sauverEvenements(coche ? evenements.filter((x) => x !== e.cle) : [...evenements, e.cle])} />
                                            <span><code className="font-mono text-[11.5px]" style={{ color: "var(--dt-text-primary)" }}>{e.cle}</code><br />{e.label}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </Champ>
                        <div className="flex flex-wrap items-center gap-3">
                            <Link href={`${SITE_PUBLIC}/docs/webhooks/signature/`} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "var(--dt-text-muted)" }}>Comment vérifier la signature</Link>
                            <Link href={`${SITE_PUBLIC}/docs/webhooks/livraisons/`} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "var(--dt-text-muted)" }}>Rejeu et journal</Link>
                        </div>
                        <Aide>Signature : en-tête <code>X-Afriflow-Signature</code>, HMAC-SHA256 de <code>timestamp.corps</code> avec votre clé secrète (de test pour un événement de test). Votre serveur a 10 secondes pour répondre 2xx ; sinon Cartflox réessaie jusqu&apos;à 10 fois sur 72 heures, et vous pouvez renvoyer à la main ci-dessous. Avec WooCommerce, le plugin enregistre l&apos;adresse lui-même.</Aide>
                    </div>
                </Bloc>

                <Bloc titre={<span className="flex items-center gap-2"><ListChecks className="h-4 w-4" /> Livraisons des webhooks</span>} sousTitre="Les 50 derniers envois vers votre serveur, avec la réponse reçue. « Renvoyer » repart tout de suite, avec une signature neuve, vers votre adresse actuelle."
                    action={<Bouton variante="secondaire" icone={RefreshCw} onClick={chargerLivraisons}>Actualiser</Bouton>}>
                    {livraisons === null ? <Squelette lignes={4} /> : livraisons.length === 0 ? (
                        <Vide titre="Aucun webhook envoyé pour le moment" texte="Ils apparaîtront ici dès qu'un paiement changera de statut, si une adresse est enregistrée." />
                    ) : (
                        <div className="min-w-0 overflow-x-auto">
                            <table className="w-full text-sm" style={{ minWidth: 560 }}>
                                <thead><tr style={{ borderBottom: "1px solid var(--dt-border)" }}>{["Quand", "Événement", "Statut", "Essais", "Réponse", ""].map((h, i) => <th key={i} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {livraisons.map((l: any) => { const s = STATUT_LIVRAISON[l.status] || { label: l.status, couleur: "#94a3b8" }; return (
                                        <tr key={l.id} style={{ borderBottom: "1px solid var(--dt-divider)" }}>
                                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--dt-text-muted)" }}>{fmtDate(l.created_at)}</td>
                                            <td className="px-3 py-2.5 font-mono text-xs" style={{ color: "var(--dt-text-primary)" }}>
                                                {l.transaction_id ? <Link href={`/transactions/${l.transaction_id}`} className="hover:underline">{l.event}</Link> : l.event}
                                                {!l.livemode && <span className="ml-1.5 rounded px-1 text-[10px] font-medium" style={{ background: "rgba(217,119,6,0.12)", color: "#b45309" }}>test</span>}
                                            </td>
                                            <td className="px-3 py-2.5"><Pastille label={s.label} couleur={s.couleur} /></td>
                                            <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--dt-text-secondary)" }}>{l.attempts}/{l.max_attempts}</td>
                                            <td className="px-3 py-2.5 text-xs" style={{ color: "var(--dt-text-muted)" }} title={l.last_error || ""}>{l.last_status_code ? `HTTP ${l.last_status_code}` : (l.last_error || "")}{l.response_ms != null ? `, ${l.response_ms} ms` : ""}</td>
                                            <td className="px-3 py-2.5 text-right"><Bouton variante="secondaire" icone={Send} chargement={occupe === `re-${l.id}`} onClick={() => renvoyer(l.id)}>Renvoyer</Bouton></td>
                                        </tr>
                                    ); })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Bloc>
            </div>

            <Bloc titre={<span className="flex items-center gap-2"><Activity className="h-4 w-4" /> Activité de votre API</span>} sousTitre="Les 25 derniers paiements créés, quelle que soit la façon dont ils ont été lancés.">
                {activite === null ? <Squelette lignes={4} /> : (
                    <>
                        <div className="mb-4 flex flex-wrap gap-2">
                            <Pastille label={`${activite.total30} paiement${activite.total30 > 1 ? "s" : ""} créé${activite.total30 > 1 ? "s" : ""} sur 30 j`} couleur="#60a5fa" />
                            <Pastille label={`${activite.reussies30} réussi${activite.reussies30 > 1 ? "s" : ""}`} couleur="#12a594" />
                            {activite.parSource.map((s: any) => <Pastille key={s.source} label={`${s.source} : ${s.nombre}`} />)}
                        </div>
                        {activite.recentes.length === 0 ? <Vide titre="Aucun paiement créé pour le moment" texte="Ils apparaîtront ici dès que votre site, un lien ou l'API créera une session de paiement." /> : (
                            <div className="min-w-0 overflow-x-auto">
                                <table className="w-full text-sm" style={{ minWidth: 640 }}>
                                    <thead><tr style={{ borderBottom: "1px solid var(--dt-border)" }}>{["Quand", "Référence", "Origine", "Moyen", "Montant", "Statut"].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--dt-text-muted)" }}>{h}</th>)}</tr></thead>
                                    <tbody>
                                        {activite.recentes.map((t: any) => { const s = STATUT[t.status] || { label: t.status, couleur: "#94a3b8" }; return (
                                            <tr key={t.id} style={{ borderBottom: "1px solid var(--dt-divider)" }}>
                                                <td className="px-3 py-2.5" style={{ color: "var(--dt-text-muted)" }}>{fmtDate(t.createdAt)}</td>
                                                <td className="px-3 py-2.5 font-mono text-xs"><Link href={`/transactions/${t.id}`} className="hover:underline" style={{ color: "var(--dt-text-primary)" }}>{t.orderId}</Link></td>
                                                <td className="px-3 py-2.5" style={{ color: "var(--dt-text-secondary)" }}>{t.paymentLink ? "Lien de paiement" : t.source}</td>
                                                <td className="px-3 py-2.5" style={{ color: "var(--dt-text-muted)" }}>{t.provider || "non choisi"}</td>
                                                <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--dt-text-primary)" }}>{fmtMontant(t.amount, t.currency)}</td>
                                                <td className="px-3 py-2.5"><Pastille label={s.label} couleur={s.couleur} /></td>
                                            </tr>
                                        ); })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </Bloc>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <LienCarte href={`${SITE_PUBLIC}/docs/`} externe icone={BookOpen} titre="Documentation" texte="Référence complète de l'API, OpenAPI, SDK Node, PHP et Python, collection Postman." />
                <LienCarte href="/integrations" icone={Puzzle} titre="Intégrations" texte="Widget, SoftPay, WooCommerce, lien de paiement : choisissez la vôtre." />
                <LienCarte href={`${SITE_PUBLIC}/status`} externe icone={Activity} titre="État du service" texte="Disponibilité de Cartflox et de chaque passerelle." />
            </div>
        </Page>
    );
}
