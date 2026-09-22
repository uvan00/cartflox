"use server";

import prisma from "@/lib/db";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getSession } from "@/lib/session";
import { getSelectedAppId } from "./utils";

/**
 * Statistiques du marchand sur la periode qu'il choisit. TOUT suit la periode
 * (chiffres, courbes, repartitions) : un seul filtre, et tous les chiffres se
 * repondent. Avant, les chiffres suivaient la periode mais pas les courbes.
 *
 * Trois regles :
 * - les montants restent dans leur devise, jamais additionnes ; la courbe des
 *   montants ne trace que la devise principale (celle du plus grand nombre de
 *   paiements) et le dit ;
 * - le taux de reussite se calcule sur les paiements ARRIVES chez un
 *   agregateur ; une session quittee avant le choix du moyen est un abandon,
 *   pas un refus (sinon un marchand sain lit 29 % de « reussite ») ;
 * - la comparaison porte sur la periode precedente de meme longueur, et il n'y
 *   en a pas quand la periode est « tout ».
 */

const JOUR = 86_400_000;
const serialiser = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
/** Ces valeurs de `provider` veulent dire « aucun agregateur n'a ete sollicite ». */
const SANS_AGREGATEUR = new Set(["", "cartflox", "afriflow", "pending", "non attribué", "sandbox"]);
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

type Ligne = {
    createdAt: Date; status: string; amount: number; currency: string; provider: string | null;
    customerEmail: string | null; customerPhone: string | null; methodCode: string | null; paymentType: string | null;
};
export type MontantDevise = { devise: string; montant: number; nombre: number };
export type PointSerie = { cle: string; label: string; reussis: number; nonAboutis: number; abandons: number; encaisse: number };

const chezAgregateur = (l: Ligne) => !SANS_AGREGATEUR.has((l.provider || "").trim().toLowerCase());
const debutJour = (d: Date) => new Date(new Date(d).setUTCHours(0, 0, 0, 0));
const finJour = (d: Date) => new Date(new Date(d).setUTCHours(23, 59, 59, 999));
const cleJour = (d: Date) => d.toISOString().slice(0, 10);
const cleMois = (d: Date) => d.toISOString().slice(0, 7);
const labelJour = (cle: string) => { const d = new Date(cle); return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`; };
const labelMois = (cle: string) => { const [a, m] = cle.split("-"); return `${MOIS[Number(m) - 1]} ${a}`; };
const evolution = (actuel: number, precedent: number) => (precedent > 0 ? Math.round(((actuel - precedent) / precedent) * 100) : null);
const point = (cle: string, label: string): PointSerie => ({ cle, label, reussis: 0, nonAboutis: 0, abandons: 0, encaisse: 0 });

/** Montants par devise, la plus frequente en premier. Jamais de somme entre devises. */
function parDevise(lignes: { currency: string; amount: number }[]): MontantDevise[] {
    const m = new Map<string, MontantDevise>();
    for (const l of lignes) {
        const e = m.get(l.currency) || { devise: l.currency, montant: 0, nombre: 0 };
        e.montant += Number(l.amount) || 0;
        e.nombre += 1;
        m.set(l.currency, e);
    }
    return [...m.values()].sort((a, b) => b.nombre - a.nombre || b.montant - a.montant);
}

/** Le pays d'un numero, d'apres son indicatif : tous les pays, pas une liste de sept. */
function paysDuNumero(tel: string | null): string | null {
    const brut = (tel || "").trim();
    if (!brut) return null;
    const p = parsePhoneNumberFromString(brut.startsWith("+") ? brut : `+${brut.replace(/\D/g, "")}`);
    return p?.country || null;
}

export async function getStatistiques(de?: string, a?: string) {
    const session = await getSession();
    if (!session?.user?.email) throw new Error("Non connecté");
    const appId = await getSelectedAppId();
    if (!appId) throw new Error("Aucun espace sélectionné");

    const tout = !de;
    const fin = finJour(a ? new Date(a) : new Date());
    let debut: Date;
    if (tout) {
        const premier = await prisma.transaction.findFirst({ where: { applicationId: appId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
        debut = debutJour(premier?.createdAt || new Date());
    } else {
        debut = debutJour(new Date(de as string));
    }
    const jours = Math.max(1, Math.round((fin.getTime() + 1 - debut.getTime()) / JOUR));
    const debutPrecedent = new Date(debut.getTime() - jours * JOUR);
    const depuis = tout ? debut : debutPrecedent;

    // Une seule lecture : la periode et la precedente. Le reste se calcule ici.
    const brut = await prisma.$queryRaw<Ligne[]>`
        select "createdAt", status::text as status, amount, currency, provider,
               "customerEmail", "customerPhone", "paymentType"::text as "paymentType",
               metadata->>'methodCode' as "methodCode"
        from "Transaction"
        where "applicationId" = ${appId} and "createdAt" >= ${depuis} and "createdAt" <= ${fin}
        order by "createdAt" asc
        limit 50000`;

    const periode = brut.filter((l) => new Date(l.createdAt) >= debut);
    const precedente = tout ? [] : brut.filter((l) => new Date(l.createdAt) < debut);
    const decide = (l: Ligne) => chezAgregateur(l) && ["SUCCESS", "FAILED", "CANCELLED"].includes(l.status);

    /* ------------------------------------------------------------ chiffres */
    const reussis = periode.filter((l) => l.status === "SUCCESS");
    const tentes = periode.filter(decide);
    const refuses = periode.filter((l) => l.status === "FAILED");
    const annules = periode.filter((l) => l.status === "CANCELLED" && chezAgregateur(l));
    const abandons = periode.filter((l) => l.status === "CANCELLED" && !chezAgregateur(l));
    const enAttente = periode.filter((l) => l.status === "PENDING");
    const encaisse = parDevise(reussis);
    const devisePrincipale = encaisse[0]?.devise || "XOF";
    const taux = (r: Ligne[], t: Ligne[]) => (t.length ? Math.round((r.filter(chezAgregateur).length / t.length) * 1000) / 10 : 0);
    const tauxReussite = taux(reussis, tentes);
    const identite = (l: Ligne) => (l.customerEmail || "").trim().toLowerCase() || (l.customerPhone || "").replace(/\D/g, "") || "";
    const clientsDistincts = (r: Ligne[]) => new Set(r.map(identite).filter(Boolean)).size;
    const montantPrincipal = (r: Ligne[]) => r.filter((l) => l.currency === devisePrincipale).reduce((s, l) => s + (Number(l.amount) || 0), 0);

    const reussisPrec = precedente.filter((l) => l.status === "SUCCESS");
    const tentesPrec = precedente.filter(decide);
    const comparaison = tout ? null : {
        jours,
        reussis: evolution(reussis.length, reussisPrec.length),
        encaisse: evolution(montantPrincipal(reussis), montantPrincipal(reussisPrec)),
        taux: tentesPrec.length ? Math.round((tauxReussite - taux(reussisPrec, tentesPrec)) * 10) / 10 : null,
        clients: evolution(clientsDistincts(reussis), clientsDistincts(reussisPrec)),
    };

    /* ------------------------------------------------------------ dans le temps */
    // Par jour jusqu'a deux mois, par mois au-dela : la courbe reste lisible.
    const granularite: "jour" | "mois" = jours <= 62 ? "jour" : "mois";
    const seaux = new Map<string, PointSerie>();
    if (granularite === "jour") {
        for (let i = 0; i < jours; i++) { const c = cleJour(new Date(debut.getTime() + i * JOUR)); seaux.set(c, point(c, labelJour(c))); }
    } else {
        const d = new Date(Date.UTC(debut.getUTCFullYear(), debut.getUTCMonth(), 1));
        while (d <= fin) { const c = cleMois(d); seaux.set(c, point(c, labelMois(c))); d.setUTCMonth(d.getUTCMonth() + 1); }
    }
    // Les heures ont la meme forme : sur un ou deux jours, ce sont elles qu'on trace.
    const heures = Array.from({ length: 24 }, (_, h) => point(String(h).padStart(2, "0"), `${String(h).padStart(2, "0")} h`));
    const ranger = (s: PointSerie, l: Ligne) => {
        if (l.status === "SUCCESS") { s.reussis += 1; if (l.currency === devisePrincipale) s.encaisse += Number(l.amount) || 0; }
        else if (l.status === "FAILED" || (l.status === "CANCELLED" && chezAgregateur(l))) s.nonAboutis += 1;
        else if (l.status === "CANCELLED") s.abandons += 1;
    };
    for (const l of periode) {
        const d = new Date(l.createdAt);
        const s = seaux.get(granularite === "jour" ? cleJour(d) : cleMois(d));
        if (s) ranger(s, l);
        ranger(heures[d.getUTCHours()], l);
    }

    /* ------------------------------------------------------------ repartitions */
    // L'operateur choisi par le client (Wave, Orange, carte...), sinon l'agregateur.
    const moyens = new Map<string, { code: string; type: string | null; reussis: number; tentatives: number }>();
    for (const l of periode) {
        const code = l.methodCode || (chezAgregateur(l) ? (l.provider || "").trim() : "");
        if (!code) continue;
        const m = moyens.get(code) || { code, type: l.paymentType, reussis: 0, tentatives: 0 };
        m.tentatives += 1;
        if (l.status === "SUCCESS") m.reussis += 1;
        moyens.set(code, m);
    }
    const totalMoyens = [...moyens.values()].reduce((s, m) => s + m.reussis, 0);
    const parMoyen = [...moyens.values()]
        .sort((x, y) => y.reussis - x.reussis || y.tentatives - x.tentatives)
        .slice(0, 6)
        .map((m) => ({ ...m, part: totalMoyens ? Math.round((m.reussis / totalMoyens) * 100) : 0 }));

    const pays = new Map<string, { code: string | null; reussis: number; encaisse: number }>();
    for (const l of reussis) {
        const code = paysDuNumero(l.customerPhone);
        const p = pays.get(code || "?") || { code, reussis: 0, encaisse: 0 };
        p.reussis += 1;
        if (l.currency === devisePrincipale) p.encaisse += Number(l.amount) || 0;
        pays.set(code || "?", p);
    }
    const parPays = [...pays.values()].sort((x, y) => y.reussis - x.reussis).slice(0, 6);

    return serialiser({
        periode: { de: debut.toISOString(), a: fin.toISOString(), jours, tout, granularite },
        devisePrincipale,
        kpis: {
            encaisse,
            panierMoyen: encaisse.map((e) => ({ ...e, montant: e.nombre ? e.montant / e.nombre : 0 })),
            reussis: reussis.length,
            tentes: tentes.length,
            refuses: refuses.length,
            annules: annules.length,
            abandons: abandons.length,
            enAttente: enAttente.length,
            tauxReussite,
            clients: clientsDistincts(reussis),
        },
        comparaison,
        serie: [...seaux.values()],
        heures,
        parMoyen,
        parPays,
        entonnoir: { sessions: periode.length, tentes: periode.filter(chezAgregateur).length, reussis: reussis.length },
    });
}
