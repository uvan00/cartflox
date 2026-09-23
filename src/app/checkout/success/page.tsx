"use client";

import React, { useEffect, useState, Suspense } from "react";
import { MARQUE } from "@/lib/marque";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, X, Loader2, Clock, ArrowRight, RotateCcw } from "lucide-react";
import { getPublicTransaction } from "@/lib/actions/transactions";
import { attacherReferenceRetour } from "@/lib/actions/retour-fournisseur";
import { getThemeById, DEFAULT_THEME, type CheckoutTheme } from "@/lib/checkout-themes";
import { Coque, PanneauMarchand, PiedCarte, BoutonSecondaire, whatsappMarchand } from "@/components/checkout/coque";
import { useLangue, t, localeNombre, type Cle } from "@/lib/i18n-checkout";

// Landing page for hosted-checkout returns (PawaPay payment page, PayDunya
// hosted invoice / cards): /checkout/success?id=<transactionId>[&status=cancelled]
// The provider may redirect the customer before the webhook lands, so we poll
// the transaction until it reaches a final state.

type Phase = 'loading' | 'success' | 'failed' | 'cancelled' | 'pending' | 'refunded' | 'notfound';

function SuccessContent() {
    const searchParams = useSearchParams();
    const transactionId = searchParams.get('id');
    // Stripe ajoute `redirect_status=failed` quand l'authentification par redirection echoue.
    const wasCancelled = searchParams.get('status') === 'cancelled' || searchParams.get('redirect_status') === 'failed';
    // Page hebergee (FeexLink v2) : le fournisseur ajoute sa reference en `?ref=` au retour.
    const refRetour = searchParams.get('ref') || searchParams.get('reference');
    // Langue de la page (adresse, choix memorise, navigateur) et raccourci de traduction.
    const { langue } = useLangue();
    const tr = (cle: Cle, valeurs?: Record<string, string | number>) => t(langue, cle, valeurs);

    const [phase, setPhase] = useState<Phase>('loading');
    const [tx, setTx] = useState<any>(null);
    const [theme, setTheme] = useState<CheckoutTheme>(DEFAULT_THEME);
    // Le sondage s'est arrete sans issue : on propose de reprendre le paiement.
    const [sondageFini, setSondageFini] = useState(false);

    useEffect(() => {
        if (!transactionId) { setPhase('notfound'); return; }
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const startedAt = Date.now();
        const POLL_EVERY_MS = 4000;
        const POLL_MAX_MS = 3 * 60 * 1000;

        const tick = async () => {
            if (cancelled) return;
            let transaction: any = null;
            try { transaction = await getPublicTransaction(transactionId); } catch { /* retry below */ }
            if (cancelled) return;

            if (transaction) {
                setTx(transaction);
                const meta = (transaction.application?.metadata || {}) as Record<string, any>;
                const perso = meta.checkoutThemeCustom;
                setTheme(perso && typeof perso === 'object'
                    ? { ...getThemeById('cartflox'), ...perso, id: 'custom', name: 'Personnalisé' }
                    : getThemeById(meta.checkoutTheme || 'cartflox'));
                if (transaction.status === 'SUCCESS') {
                    setPhase('success');
                    try {
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({ type: 'afriflow:success', payload: { transactionId, orderId: transaction.orderId, amount: transaction.amount, currency: transaction.currency } }, '*');
                        }
                    } catch {}
                    // Seulement http(s) : une adresse javascript: s'executerait sur notre domaine.
                    const successUrl = String((transaction.metadata as any)?.success_url || "");
                    if (/^https?:\/\//i.test(successUrl)) setTimeout(() => { window.location.href = successUrl; }, 2500);
                    return;
                }
                if (transaction.status === 'FAILED') { setPhase('failed'); return; }
                if (transaction.status === 'REFUNDED') { setPhase('refunded'); return; }
                if (transaction.status === 'CANCELLED' || wasCancelled) { setPhase('cancelled'); return; }
                setPhase('pending');
            } else if (Date.now() - startedAt > 20000) {
                // Still no transaction after 20s of retries — give up
                setPhase('notfound');
                return;
            }

            if (Date.now() - startedAt < POLL_MAX_MS) {
                timer = setTimeout(tick, POLL_EVERY_MS);
            } else {
                setSondageFini(true);
            }
        };

        (async () => {
            if (refRetour) { try { await attacherReferenceRetour(transactionId, refRetour); } catch { /* le sondage prend le relais */ } }
            tick();
        })();
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactionId, wasCancelled]);

    const amount = tx ? new Intl.NumberFormat(localeNombre(langue)).format(Number(tx.amount)) : null;
    const currency = tx?.currency || '';
    const marchand = { nom: tx?.application?.name || tr("marchand"), image: tx?.application?.image };
    const retryHref = transactionId ? `/checkout/${transactionId}` : null;
    const testMode = (tx?.metadata as any)?.testMode === true;

    const visuals: Record<Phase, { icon: React.ReactNode; iconBg: string; iconColor: string; title: string; detail: string }> = {
        loading: { icon: <Loader2 size={26} className="animate-spin" />, iconBg: theme.methodHoverBg, iconColor: theme.textMuted, title: tr("phase_loading_titre"), detail: tr("phase_loading_texte") },
        pending: { icon: <Clock size={26} />, iconBg: 'rgba(245,158,11,0.12)', iconColor: '#d97706', title: tr("phase_pending_titre"), detail: tr("phase_pending_texte") },
        success: { icon: <Check size={30} strokeWidth={3} />, iconBg: '#12a594', iconColor: '#fff', title: tr("paiement_reussi"), detail: tr("phase_success_texte") },
        failed: { icon: <X size={26} />, iconBg: 'rgba(239,68,68,0.12)', iconColor: '#ef4444', title: tr("phase_failed_titre"), detail: tr("phase_failed_texte") },
        cancelled: { icon: <X size={26} />, iconBg: theme.methodHoverBg, iconColor: theme.textMuted, title: tr("phase_cancelled_titre"), detail: tr("phase_cancelled_texte") },
        refunded: { icon: <RotateCcw size={26} />, iconBg: 'rgba(59,130,246,0.12)', iconColor: '#3b82f6', title: tr("phase_refunded_titre"), detail: tr("phase_refunded_texte") },
        notfound: { icon: <X size={26} />, iconBg: 'rgba(239,68,68,0.12)', iconColor: '#ef4444', title: tr("transaction_introuvable"), detail: tr("phase_notfound_texte") },
    };
    const v = visuals[phase];

    return (
        <Coque theme={theme} langue={langue} test={testMode} gauche={
            tx && phase !== 'notfound' ? (
                <PanneauMarchand theme={theme} marchand={marchand} titre={tx.description || tr("paiement_a", { nom: marchand.nom })} montant={amount || ''} devise={currency}
                    etiquette={phase === 'success' ? tr("montant_paye") : tr("montant")}
                    lignes={[...(tx.customerEmail ? [{ label: tr("recu_envoye_a"), valeur: String(tx.customerEmail) }] : []), ...(tx.providerRef || tx.orderId ? [{ label: tr("reference"), valeur: String(tx.providerRef || tx.orderId) }] : [])]} />
            ) : (
                <div className="hidden lg:block"><p className="text-[13px]" style={{ color: theme.textMuted }}>{MARQUE}</p><p className="mt-2 text-[28px] leading-tight" style={{ color: theme.textPrimary }}>{tr("suivi_paiement")}</p></div>
            )
        }>
            <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                <motion.div key={phase} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 14 }}
                    className="grid h-16 w-16 place-content-center rounded-full" style={{ background: v.iconBg, color: v.iconColor, boxShadow: phase === 'success' ? '0 0 0 8px rgba(18,165,148,0.12)' : 'none' }}>
                    {v.icon}
                </motion.div>
                <div>
                    <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: theme.textPrimary }}>{v.title}</h1>
                    <p className="mx-auto mt-1 max-w-[300px] text-[13px] leading-relaxed" style={{ color: theme.textMuted }}>{v.detail}</p>
                    {amount && phase !== 'notfound' && <p className="mt-3 text-[14px] font-medium" style={{ color: theme.textSecondary }}>{tr("montant_a", { montant: amount, devise: currency, nom: marchand.nom })}</p>}
                </div>
                {(phase === 'failed' || phase === 'cancelled' || (phase === 'pending' && sondageFini)) && retryHref && (
                    <a href={retryHref} className="inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14px] font-semibold" style={{ background: theme.accent, color: theme.accentText, textDecoration: 'none' }}>
                        {tr("reessayer_paiement")} <ArrowRight size={15} />
                    </a>
                )}
                {phase === 'success' && <BoutonSecondaire theme={theme} onClick={() => window.close()}>{tr("fermer_page")}</BoutonSecondaire>}
            </div>
            <PiedCarte theme={theme} whatsapp={whatsappMarchand(tx?.application)} />
        </Coque>
    );
}

export default function CheckoutSuccessPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center" style={{ background: DEFAULT_THEME.pageBg }}>
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: DEFAULT_THEME.textMuted }} />
            </div>
        }>
            <SuccessContent />
        </Suspense>
    );
}
