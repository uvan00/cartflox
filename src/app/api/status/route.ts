import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { PaymentOrchestratorFactory } from "@/lib/orchestrator/factory";

/**
 * GET /api/status
 *
 * Etat reel de la plateforme, deduit de l'activite recente : base de donnees,
 * sessions de paiement (24 h), webhooks entrants (24 h) et, par passerelle,
 * le sort des paiements des 7 derniers jours. Alimente la page publique
 * /status ; aucune donnee marchande n'est exposee, seulement des comptages.
 */
export const dynamic = "force-dynamic";

type Etat = "ok" | "degrade" | "panne" | "inconnu";

const LIBELLES: Record<string, string> = {
    paydunya: "PayDunya", pawapay: "PawaPay", paystack: "Paystack", stripe: "Stripe",
    fedapay: "FedaPay", kkiapay: "KKiaPay", flutterwave: "Flutterwave", cinetpay: "CinetPay",
    feexpay: "FeexPay", notchpay: "NotchPay", coinbase: "Coinbase Commerce", hub2: "Hub2", paypal: "PayPal",
    moneroo: "Moneroo", softpay: "SoftPay", moneyfusion: "MoneyFusion", bizao: "Bizao",
    touchpay: "TouchPay", intouch: "InTouch", wave: "Wave", orange: "Orange Money",
    cryptomus: "Cryptomus", qosic: "Qosic", monetbill: "MonetBill", payplus: "PayPlus", lengopay: "LengoPay",
    paytech: "PayTech", onepay: "Magma OnePay", djamo: "Djamo Business", ipay: "iPay Money",
};

const libelle = (cle: string) => LIBELLES[cle] || cle.charAt(0).toUpperCase() + cle.slice(1);

export async function GET() {
    const maintenant = Date.now();
    const depuis24h = new Date(maintenant - 24 * 3600 * 1000);
    const depuis7j = new Date(maintenant - 7 * 24 * 3600 * 1000);

    // 1. Base de donnees
    let bdd: { etat: Etat; detail: string } = { etat: "ok", detail: "" };
    try {
        const t = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const ms = Date.now() - t;
        bdd = { etat: ms > 2000 ? "degrade" : "ok", detail: `Réponse en ${ms} ms` };
    } catch {
        bdd = { etat: "panne", detail: "Base de données injoignable" };
    }

    // 2. Sessions de paiement et webhooks des 24 dernieres heures
    let sessions24h = 0, reussies24h = 0;
    let webhooks: { etat: Etat; detail: string } = { etat: "ok", detail: "Aucun webhook reçu sur 24 h" };
    let passerelles: { nom: string; etat: Etat; detail: string }[] = [];
    if (bdd.etat !== "panne") {
        try {
            sessions24h = await prisma.transaction.count({ where: { createdAt: { gte: depuis24h } } });
            reussies24h = await prisma.transaction.count({ where: { createdAt: { gte: depuis24h }, status: "SUCCESS" } });

            const evts = await prisma.webhookEvent.groupBy({
                by: ["status"],
                where: { createdAt: { gte: depuis24h } },
                _count: { _all: true },
            });
            const nb = (s: string) => evts.find((e) => e.status === s)?._count._all || 0;
            const total = evts.reduce((a, e) => a + e._count._all, 0);
            const echecs = nb("FAILED");
            if (total > 0) {
                const taux = echecs / total;
                webhooks = {
                    etat: total >= 5 && taux > 0.5 ? "panne" : total >= 5 && taux > 0.2 ? "degrade" : "ok",
                    detail: `${total} webhook${total > 1 ? "s" : ""} reçu${total > 1 ? "s" : ""} sur 24 h${echecs ? `, ${echecs} en échec` : ""}`,
                };
            }

            // 3. Passerelles : sort des paiements des 7 derniers jours, par fournisseur
            const grp = await prisma.transaction.groupBy({
                by: ["provider", "status"],
                where: { createdAt: { gte: depuis7j }, provider: { not: "" } },
                _count: { _all: true },
            });
            const parCle = new Map<string, { succes: number; echecs: number; total: number }>();
            const connus = PaymentOrchestratorFactory.listProviders().map((p: string) => p.toLowerCase()).filter((p) => p !== "mock");
            for (const g of grp) {
                const brut = (g.provider || "").toLowerCase();
                const cle = connus.find((k) => brut.includes(k)) || brut.split(/[^a-z0-9]/)[0];
                if (!cle) continue;
                const acc = parCle.get(cle) || { succes: 0, echecs: 0, total: 0 };
                acc.total += g._count._all;
                if (g.status === "SUCCESS") acc.succes += g._count._all;
                if (g.status === "FAILED") acc.echecs += g._count._all;
                parCle.set(cle, acc);
            }
            const noms = Array.from(new Set([...connus, ...Array.from(parCle.keys())]));
            passerelles = noms.map((cle) => {
                const s = parCle.get(cle);
                if (!s || s.total === 0) return { nom: libelle(cle), etat: "ok" as Etat, detail: "Pas de trafic sur 7 jours" };
                const decides = s.succes + s.echecs;
                const tauxEchec = decides > 0 ? s.echecs / decides : 0;
                const etat: Etat = decides >= 5 && tauxEchec > 0.6 ? "degrade" : "ok";
                return {
                    nom: libelle(cle),
                    etat,
                    detail: `${s.succes} paiement${s.succes > 1 ? "s" : ""} réussi${s.succes > 1 ? "s" : ""} sur 7 jours${s.echecs ? `, ${s.echecs} échec${s.echecs > 1 ? "s" : ""}` : ""}`,
                };
            }).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
        } catch (e) {
            console.error("[status]", e);
        }
    }

    const plateforme = [
        { cle: "api", nom: "API de paiement", etat: "ok" as Etat, detail: "Répond normalement" },
        { cle: "bdd", nom: "Base de données", ...bdd },
        {
            cle: "checkout", nom: "Page de paiement (checkout)",
            etat: (bdd.etat === "panne" ? "panne" : "ok") as Etat,
            detail: bdd.etat === "panne" ? "Indisponible" : `${sessions24h} session${sessions24h > 1 ? "s" : ""} sur 24 h, ${reussies24h} paiement${reussies24h > 1 ? "s" : ""} réussi${reussies24h > 1 ? "s" : ""}`,
        },
        { cle: "dashboard", nom: "Tableau de bord marchand", etat: (bdd.etat === "panne" ? "panne" : "ok") as Etat, detail: bdd.etat === "panne" ? "Indisponible" : "Répond normalement" },
        { cle: "webhooks", nom: "Webhooks", ...webhooks },
    ];

    const etats = [...plateforme.map((p) => p.etat), ...passerelles.map((p) => p.etat)];
    const global: Etat = etats.includes("panne") ? "panne" : etats.includes("degrade") ? "degrade" : "ok";

    return NextResponse.json(
        { etat: global, misAJour: new Date().toISOString(), plateforme, passerelles },
        { status: global === "panne" ? 503 : 200, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } }
    );
}
