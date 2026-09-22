"use server";

import prisma from "@/lib/db";
import { getSession } from "@/lib/session";
import { getSelectedAppId } from "./utils";
import { creerTransfert, listerTransferts, optionsPourEspace, synchroniserTransfert, etatPasserelle, methodesDesactivees, ErreurTransfert } from "@/lib/transferts";

/** Actions du tableau de bord pour les transferts sortants. */
const serialiser = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

async function espace() {
    const s = await getSession();
    if (!s?.user?.email) throw new Error("Non connecté");
    const appId = await getSelectedAppId();
    if (!appId) throw new Error("Aucun espace sélectionné");
    return { appId, email: s.user.email };
}

export async function optionsTransfert() {
    const { appId } = await espace();
    const app: any = await prisma.application.findUnique({
        where: { id: appId },
        select: { transfertsActifs: true, transfertMaxParJour: true } as any,
    });
    const o = await optionsPourEspace(appId);
    const soldes: { devise: string; montant: number }[] = [];
    return serialiser({
        actifs: !!app?.transfertsActifs,
        managed: o.managed,
        identiteVerifiee: true,
        fraisBps: 0,
        maxParJour: app?.transfertMaxParJour ?? 200,
        pays: o.pays,
        fournisseurs: o.fournisseurs,
        soldes,
    });
}

export async function mesTransferts(limite = 100) {
    const { appId } = await espace();
    return serialiser(await listerTransferts(appId, { limite }));
}

export async function envoyerTransfert(entree: { montant: number; pays: string; operateur: string; telephone: string; nomBeneficiaire?: string; motif?: string; cle: string }) {
    const { appId, email } = await espace();
    try {
        const r = await creerTransfert({
            applicationId: appId, montant: Number(entree.montant), pays: entree.pays, operateur: entree.operateur, telephone: entree.telephone,
            nomBeneficiaire: entree.nomBeneficiaire, motif: entree.motif, cleIdempotence: entree.cle, source: "tableau_de_bord", acteur: email,
        });
        return serialiser({ ok: true as const, transfert: r.transfert, rejoue: r.rejoue });
    } catch (e: any) {
        if (e instanceof ErreurTransfert) return { ok: false as const, message: e.message, code: e.code };
        console.error("[transferts] envoi depuis le tableau de bord :", e);
        return { ok: false as const, message: "Le transfert n'a pas pu être créé. Réessayez dans un instant.", code: "internal" };
    }
}

/** Redemande l'etat au fournisseur pour UN transfert encore ouvert. */
export async function actualiserTransfert(id: string) {
    const { appId } = await espace();
    const t = await prisma.transfert.findFirst({ where: { id, applicationId: appId } });
    if (!t) return null;
    try { return serialiser(await synchroniserTransfert(id, "main")); } catch { return serialiser(t); }
}

/** Les passerelles de l'espace et ce qu'elles savent faire pour les transferts. */
export async function passerellesPourTransferts() {
    const { appId } = await espace();
    const managed = false;
    const gateways: any[] = await prisma.gateway.findMany({ where: { applicationId: appId }, orderBy: { createdAt: "desc" } });
    return serialiser({
        managed,
        passerelles: gateways.map((g: any) => ({ id: g.id, nom: g.name, statut: g.status, modeTest: (g.config as any)?.mode === "test", ...etatPasserelle(g) })),
    });
}

/** Le marchand choisit si une de ses passerelles peut servir aux transferts. Elle reste une passerelle d'encaissement. */
export async function basculerPasserelleTransferts(gatewayId: string, actif: boolean) {
    const { appId } = await espace();
    const g: any = await prisma.gateway.findFirst({ where: { id: gatewayId, applicationId: appId } });
    if (!g) return { ok: false, message: "Passerelle introuvable." };
    // La configuration est reecrite telle quelle (secrets chiffres compris), avec le seul drapeau en plus.
    await prisma.gateway.update({ where: { id: gatewayId }, data: { config: { ...((g.config as any) || {}), transferts: actif } as any } });
    return { ok: true };
}

export async function methodesTransfert() {
    const { appId } = await espace();
    const o = await optionsPourEspace(appId);
    return serialiser({ managed: o.managed, pays: o.pays });
}

/** Couper ou rouvrir un operateur dans un pays pour les transferts (« CI:wave »). */
export async function basculerMethodeTransfert(pays: string, operateur: string, actif: boolean) {
    const { appId } = await espace();
    const cle = `${String(pays).toUpperCase()}:${String(operateur)}`;
    const coupees = await methodesDesactivees(appId);
    if (actif) coupees.delete(cle); else coupees.add(cle);
    await prisma.$executeRawUnsafe(
        `UPDATE "Application" SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
        JSON.stringify({ transfertsMethodesDesactivees: [...coupees] }),
        appId,
    );
    return { ok: true, desactivees: [...coupees] };
}
