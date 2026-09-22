import crypto from "node:crypto";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import prisma from "@/lib/db";
import { arrondirMontant, formaterMontant } from "@/lib/devises";
import { buildAdapterConfig } from "@/lib/orchestrator/executor";
import { createNotification } from "@/lib/notifications";
import { envoyerWebhook } from "@/lib/webhook-dispatch";
import { FOURNISSEURS, fournisseurDe } from "./registre";
import type { Fournisseur, PayoutResponse } from "./types";

/**
 * Transferts d'argent SORTANTS (ce que Moneroo appelle « payout ») : un
 * marchand envoie une somme vers un compte Mobile Money, par l'API ou depuis
 * son tableau de bord. Cartflox confie l'envoi a l'un de ses fournisseurs qui
 * sait le faire (registre.ts), avec les cles du marchand ou, pour un espace
 * Connect, depuis son solde chez Cartflox.
 *
 * Trois garde-fous, parce que l'argent sort :
 * - la reference est generee et ENREGISTREE avant l'appel au fournisseur ; si
 *   la reponse se perd, on l'interroge avec elle quand il le permet, et sinon
 *   on laisse l'envoi ouvert : on ne renvoie jamais a l'aveugle ;
 * - une cle d'idempotence fournie par l'appelant rend un second appel inoffensif ;
 * - les transferts sont fermes par defaut (`transfertsActifs`), ouverts par
 *   l'administrateur, et plafonnes en nombre par jour.
 */

export class ErreurTransfert extends Error {
    constructor(message: string, public code: string, public http = 400) {
        super(message);
        this.name = "ErreurTransfert";
    }
}

/** Pays desservis et leur devise. Les operateurs se deduisent des passerelles de l'espace. */
export const PAYS_TRANSFERT: Record<string, { nom: string; devise: string }> = {
    CI: { nom: "Côte d'Ivoire", devise: "XOF" },
    SN: { nom: "Sénégal", devise: "XOF" },
    BJ: { nom: "Bénin", devise: "XOF" },
    BF: { nom: "Burkina Faso", devise: "XOF" },
    TG: { nom: "Togo", devise: "XOF" },
    ML: { nom: "Mali", devise: "XOF" },
    NE: { nom: "Niger", devise: "XOF" },
    GN: { nom: "Guinée", devise: "GNF" },
    CM: { nom: "Cameroun", devise: "XAF" },
    GA: { nom: "Gabon", devise: "XAF" },
    CG: { nom: "Congo", devise: "XAF" },
    CD: { nom: "RD Congo", devise: "CDF" },
    GH: { nom: "Ghana", devise: "GHS" },
    NG: { nom: "Nigeria", devise: "NGN" },
    KE: { nom: "Kenya", devise: "KES" },
    TZ: { nom: "Tanzanie", devise: "TZS" },
    UG: { nom: "Ouganda", devise: "UGX" },
    RW: { nom: "Rwanda", devise: "RWF" },
    ZM: { nom: "Zambie", devise: "ZMW" },
};

/** Le vocabulaire Cartflox des operateurs, commun a tous les fournisseurs. */
export const OPERATEURS: Record<string, string> = {
    orange_money: "Orange Money", mtn_money: "MTN Mobile Money", moov_money: "Moov Money", wave: "Wave",
    free_money: "Free Money", emoney: "E-Money", expresso: "Expresso", djamo: "Djamo", tmoney: "T-Money", celtiis: "Celtiis Cash",
    mpesa: "M-Pesa", airtel_money: "Airtel Money", tigo_pesa: "Tigo Pesa", halopesa: "HaloPesa", vodacom: "Vodacom M-Pesa",
    zamtel: "Zamtel Kwacha", vodafone_cash: "Telecel Cash", airtel_tigo: "AirtelTigo Money", express_union: "Express Union", mobicash: "Mobicash",
};

export const STATUT_API: Record<string, string> = { EN_ATTENTE: "pending", EN_COURS: "processing", REUSSI: "succeeded", ECHOUE: "failed" };

const ALIAS_OPERATEUR: Record<string, string> = {
    mtn: "mtn_money", mtn_momo: "mtn_money", momo: "mtn_money",
    orange: "orange_money", om: "orange_money",
    moov: "moov_money", flooz: "moov_money",
    free: "free_money", t_money: "tmoney", airtel: "airtel_money", m_pesa: "mpesa", e_money: "emoney", telecel: "vodafone_cash", vodafone: "vodafone_cash",
};

/** Passe ce delai sans que le fournisseur connaisse notre reference, l'envoi ne lui est jamais parvenu. */
const DELAI_NON_RECU_MS = 30 * 60 * 1000;

/** « MTN », « mtn-momo », « Orange Money » ou « MTN_MOMO_CIV » : un seul code en sortie. */
export function normaliserOperateur(brut: string): string {
    const v = String(brut || "").trim();
    if (v && v === v.toUpperCase() && /^[A-Z0-9]+(?:_[A-Z0-9]+)*_[A-Z]{3}$/.test(v)) return v;
    const cle = v.toLowerCase().replace(/[\s-]+/g, "_").replace(/_money$/, "");
    return ALIAS_OPERATEUR[cle] || cle;
}

/** Le numero en chiffres, indicatif compris, ou null s'il n'est pas un numero possible de ce pays. */
export function numeroPourTransfert(brut: string, pays: string): string | null {
    const v = String(brut || "").trim();
    if (!v) return null;
    const p = parsePhoneNumberFromString(v, pays as CountryCode)
        || parsePhoneNumberFromString(v.startsWith("+") ? v : `+${v.replace(/\D/g, "")}`);
    if (!p || !p.isPossible()) return null;
    if (p.country && p.country !== pays) return null;
    return p.number.replace(/^\+/, "");
}

const configDe = (gateway: any, f: Fournisseur) => buildAdapterConfig(gateway, f.cle);
const saitEnvoyer = (gateway: any, pays: string, operateur: string) => {
    const f = fournisseurDe(gateway);
    return !!f && !!f.correspondant(pays, operateur);
};

/** Les passerelles de l'espace qui savent envoyer de l'argent. */
export async function passerellesTransfert(applicationId: string) {
    const managed = false;
    const gateways: any[] = await prisma.gateway.findMany({ where: { applicationId, status: "active" } });
    // Une passerelle coupee pour les transferts par le marchand (config.transferts = false) reste une passerelle d'encaissement.
    return { managed, gateways: gateways.filter((g: any) => g.status === "active" && fournisseurDe(g) && (g.config as any)?.transferts !== false) };
}

/** Les moyens que le marchand a coupes pour les transferts (« CI:wave »), dans Application.metadata. */
export async function methodesDesactivees(applicationId: string): Promise<Set<string>> {
    const app: any = await prisma.application.findUnique({ where: { id: applicationId }, select: { metadata: true } });
    const liste = (app?.metadata as any)?.transfertsMethodesDesactivees;
    return new Set(Array.isArray(liste) ? liste.map(String) : []);
}

/**
 * L'etat d'une passerelle vis-a-vis des transferts : sait-elle envoyer, avec
 * quelles cles manquantes, vers quels pays. Sert a la page « Passerelles ».
 */
export function etatPasserelle(gateway: any) {
    const f = fournisseurDe(gateway);
    if (!f) return { fournisseur: null as string | null, fournisseurCle: null as string | null, saitEnvoyer: false, actif: false, manquants: [] as string[], pays: [] as string[], avertissement: null as string | null };
    let manquants: string[] = [];
    try {
        const config = buildAdapterConfig(gateway, f.cle) || {};
        manquants = f.cles.filter((c) => !String(config[c.champ] || "").trim()).map((c) => c.libelle);
    } catch (e: any) {
        manquants = [e?.message || "configuration invalide"];
    }
    const pays = Object.keys(PAYS_TRANSFERT).filter((p) => Object.keys(OPERATEURS).some((op) => f.correspondant(p, op)));
    return { fournisseur: f.nom, fournisseurCle: f.cle, saitEnvoyer: true, actif: gateway.status === "active" && (gateway.config as any)?.transferts !== false, manquants, pays, avertissement: f.avertissement || null };
}

/** Ce que l'espace peut faire : pays, operateurs, et par quel fournisseur. Sert au formulaire et a l'API. */
export async function optionsPourEspace(applicationId: string) {
    const { gateways, managed } = await passerellesTransfert(applicationId);
    const coupees = await methodesDesactivees(applicationId);
    const pays = Object.entries(PAYS_TRANSFERT).map(([code, p]) => ({
        code, nom: p.nom, devise: p.devise,
        operateurs: Object.entries(OPERATEURS).flatMap(([op, nom]) => {
            const g = gateways.find((gw: any) => saitEnvoyer(gw, code, op));
            if (!g) return [];
            const f = fournisseurDe(g)!;
            return [{ code: op, nom, fournisseur: f.nom, fournisseurCle: f.cle, avertissement: f.avertissement || null, desactive: coupees.has(`${code}:${op}`) }];
        }),
    })).filter((p) => p.operateurs.length > 0);
    return { managed, pays, desactivees: [...coupees], fournisseurs: [...new Set(gateways.map((g: any) => fournisseurDe(g)?.nom).filter(Boolean))] as string[] };
}

function avecJournal(metadata: unknown, quoi: string, detail: unknown) {
    const m = (metadata && typeof metadata === "object" ? { ...(metadata as Record<string, unknown>) } : {}) as Record<string, unknown>;
    const journal = Array.isArray(m.journal) ? [...(m.journal as unknown[])] : [];
    journal.push({ quand: new Date().toISOString(), quoi, detail: JSON.parse(JSON.stringify(detail ?? null)) });
    m.journal = journal.slice(-20);
    return m;
}

export type NouveauTransfert = {
    applicationId: string;
    montant: number;
    devise?: string;
    pays: string;
    operateur: string;
    telephone: string;
    nomBeneficiaire?: string;
    motif?: string;
    cleIdempotence?: string;
    source?: "api" | "tableau_de_bord";
    metadata?: Record<string, unknown>;
    acteur?: string;
};

/**
 * Cree le transfert puis le confie au fournisseur. Toutes les verifications
 * ont lieu AVANT qu'une ligne existe ; le debit du solde Connect et la ligne
 * naissent dans la meme transaction ; l'appel reseau se fait hors verrou.
 */
export async function creerTransfert(entree: NouveauTransfert) {
    const app: any = await prisma.application.findUnique({
        where: { id: entree.applicationId },
        select: { id: true, name: true, userId: true, transfertsActifs: true, transfertMaxParJour: true },
    });
    if (!app) throw new ErreurTransfert("Espace introuvable.", "espace_introuvable", 404);
    if (!app.transfertsActifs) {
        throw new ErreurTransfert("Les transferts d'argent sont fermés sur cet espace par l'administration Cartflox. Écrivez au support pour en connaître la raison.", "transferts_inactifs", 403);
    }

    // Idempotence : la meme cle renvoie le meme transfert, jamais un second envoi.
    const cleIdempotence = entree.cleIdempotence ? String(entree.cleIdempotence).slice(0, 120) : null;
    if (cleIdempotence) {
        const existant = await prisma.transfert.findUnique({ where: { applicationId_cleIdempotence: { applicationId: app.id, cleIdempotence } } });
        if (existant) return { transfert: existant, rejoue: true };
    }

    const pays = String(entree.pays || "").toUpperCase();
    const regles = PAYS_TRANSFERT[pays];
    if (!regles) throw new ErreurTransfert(`Pays non desservi pour les transferts : ${pays || "?"}. Pays possibles : ${Object.keys(PAYS_TRANSFERT).join(", ")}.`, "pays_non_desservi");
    const operateur = normaliserOperateur(entree.operateur);
    if (!operateur) throw new ErreurTransfert("L'opérateur du bénéficiaire est obligatoire.", "operateur_manquant");
    const devise = String(entree.devise || regles.devise).toUpperCase();
    if (devise !== regles.devise) throw new ErreurTransfert(`Un transfert vers ${regles.nom} se fait en ${regles.devise}, pas en ${devise}.`, "devise_invalide");
    const montant = arrondirMontant(Number(entree.montant), devise);
    if (!Number.isFinite(montant) || montant <= 0) throw new ErreurTransfert("Le montant doit être supérieur à zéro.", "montant_invalide");
    const telephone = numeroPourTransfert(entree.telephone, pays);
    if (!telephone) throw new ErreurTransfert(`Numéro invalide pour ${regles.nom}.`, "telephone_invalide");

    const { gateways, managed } = await passerellesTransfert(app.id);
    const gateway = gateways.find((g: any) => saitEnvoyer(g, pays, operateur));
    if (!gateway) {
        throw new ErreurTransfert(`Aucune passerelle de cet espace ne sait envoyer vers ${OPERATEURS[operateur] || operateur} en ${regles.nom}.`, "operateur_non_desservi");
    }
    const fournisseur = fournisseurDe(gateway)!;
    if ((await methodesDesactivees(app.id)).has(`${pays}:${operateur}`)) {
        throw new ErreurTransfert(`${OPERATEURS[operateur] || operateur} en ${regles.nom} est désactivé dans vos méthodes de transfert.`, "methode_desactivee");
    }

    const depuisMinuit = new Date(new Date().setUTCHours(0, 0, 0, 0));
    const aujourdhui = await prisma.transfert.count({ where: { applicationId: app.id, createdAt: { gte: depuisMinuit }, statut: { not: "ECHOUE" } } });
    const plafond = Number(app.transfertMaxParJour) || 200;
    if (aujourdhui >= plafond) throw new ErreurTransfert(`Plafond du jour atteint : ${plafond} transferts. Il se réinitialise à minuit (GMT).`, "plafond_journalier", 429);

    // Avec ses propres cles, le marchand paie son agregateur directement : aucun frais ici.
    const frais = 0;

    const reference = crypto.randomUUID();
    const cree = await prisma.$transaction(async (tx) => {
        const t = await tx.transfert.create({
            data: {
                applicationId: app.id, reference, cleIdempotence, montant, devise, frais, pays, operateur, telephone,
                nomBeneficiaire: entree.nomBeneficiaire ? String(entree.nomBeneficiaire).slice(0, 120) : null,
                motif: entree.motif ? String(entree.motif).slice(0, 200) : null,
                statut: "EN_ATTENTE", fournisseur: gateway.name, gatewayId: gateway.id,
                source: entree.source || "api",
                metadata: avecJournal({ ...(entree.metadata || {}), acteur: entree.acteur || null }, "cree", { managed, frais, fournisseur: fournisseur.nom }) as any,
            },
        });
        return t;
    });

    // L'appel reseau se fait HORS transaction : rien a faire dans un verrou de base.
    return { transfert: await confierAuFournisseur(cree.id), rejoue: false };
}

/** Confie un transfert EN_ATTENTE au fournisseur. Marque l'envoi AVANT l'appel : si le processus tombe pendant, on interrogera au lieu de renvoyer. */
async function confierAuFournisseur(id: string) {
    const t = await prisma.transfert.findUnique({ where: { id } });
    if (!t || t.statut !== "EN_ATTENTE" || t.refFournisseur) return t;
    const gateway = t.gatewayId ? await prisma.gateway.findUnique({ where: { id: t.gatewayId } }) : null;
    const fournisseur = fournisseurDe(gateway);
    if (!gateway || !fournisseur) {
        return appliquer(id, { providerReference: t.reference, status: "FAILED", failureCode: "PASSERELLE_ABSENTE", failureMessage: "La passerelle de ce transfert n'existe plus." }, "passerelle_absente");
    }
    let config: any;
    try {
        config = configDe(gateway, fournisseur);
    } catch (e: any) {
        return appliquer(id, { providerReference: t.reference, status: "FAILED", failureCode: "PASSERELLE_INVALIDE", failureMessage: e?.message || "Passerelle mal configurée." }, "passerelle_invalide");
    }

    await prisma.transfert.update({ where: { id }, data: { refFournisseur: t.reference, statut: "EN_COURS" } });
    let issue: PayoutResponse;
    try {
        issue = await fournisseur.initier(config, {
            reference: t.reference, amount: t.montant, currency: t.devise, country: t.pays, operator: t.operateur,
            phone: t.telephone, recipientName: t.nomBeneficiaire || undefined, description: t.motif || undefined,
        });
    } catch (e: any) {
        // Issue inconnue : on laisse EN_COURS ; le cron demandera au fournisseur quand c'est possible.
        const journal = avecJournal(t.metadata, "envoi_incertain", { erreur: e?.message });
        return prisma.transfert.update({ where: { id }, data: { metadata: journal as any } });
    }
    return appliquer(id, issue, "envoi");
}

/**
 * Applique une issue venue du fournisseur. Les etats finaux sont verrouilles :
 * un rappel en retard, ou deux verifications simultanees, ne rembourseront
 * jamais deux fois le solde Connect. Un rappel NON verifie (`*_non_verifie`)
 * change l'etat mais ne touche pas au solde : le retour se fait a la main.
 */
async function appliquer(id: string, issue: PayoutResponse, quoi: string) {
    const t = await prisma.transfert.findUnique({ where: { id }, include: { application: { select: { userId: true, name: true } } } });
    if (!t) return null;
    if (t.statut === "REUSSI" || t.statut === "ECHOUE") return t;
    const journal = avecJournal(t.metadata, quoi, { statut: issue.status, code: issue.failureCode, message: issue.failureMessage, fournisseur: issue.rawData });
    const ouverts = ["EN_ATTENTE", "EN_COURS"] as const;
    const refFournisseur = issue.providerReference && issue.providerReference !== t.reference ? issue.providerReference : t.refFournisseur || t.reference;
    const commun = { codeFournisseur: issue.providerCode || t.codeFournisseur, refFournisseur };

    if (issue.status === "SUCCESS") {
        const n = await prisma.transfert.updateMany({
            where: { id, statut: { in: [...ouverts] } },
            data: { ...commun, statut: "REUSSI", termineLe: new Date(), refFournisseur: issue.providerTransactionId || refFournisseur, metadata: journal as any },
        });
        const maj = await prisma.transfert.findUnique({ where: { id } });
        if (n.count === 1 && maj) await prevenir(maj, t.application);
        return maj;
    }

    if (issue.status === "FAILED") {
        const verifie = !quoi.endsWith("_non_verifie");
        const maj = await prisma.$transaction(async (tx) => {
            const n = await tx.transfert.updateMany({
                where: { id, statut: { in: [...ouverts] } },
                data: { ...commun, statut: "ECHOUE", termineLe: new Date(), echecCode: issue.failureCode || null, echecMessage: issue.failureMessage || null, metadata: journal as any },
            });
            return { n: n.count, t: await tx.transfert.findUnique({ where: { id } }) };
        });
        if (maj.n === 1 && maj.t) await prevenir(maj.t, t.application);
        return maj.t;
    }

    return prisma.transfert.update({ where: { id }, data: { ...commun, statut: "EN_COURS", metadata: journal as any } });
}

/** Le marchand est prevenu dans son tableau de bord et, s'il en a un, sur son webhook. */
async function prevenir(t: any, app: { userId: string; name: string }) {
    const reussi = t.statut === "REUSSI";
    const vers = `${formaterMontant(t.montant, t.devise)} vers ${t.telephone}${t.nomBeneficiaire ? ` (${t.nomBeneficiaire})` : ""}`;
    await createNotification({
        userId: app.userId, type: "payment",
        title: reussi ? "Transfert effectué" : "Transfert échoué",
        body: reussi ? vers : `${vers} : ${t.echecMessage || "refusé par l'opérateur"}. Rien n'a été débité de votre côté.`,
        link: "/transfers",
    });
    // Journalise et signe (avant, le secret lu n'existait pas : le webhook partait sans signature).
    envoyerWebhook(
        { data: versApi(t), timestamp: new Date().toISOString() },
        { applicationId: t.applicationId, event: reussi ? "transfer.succeeded" : "transfer.failed", transfertId: t.id }
    ).catch(() => { /* deja journalise */ });
}

/** Demande l'etat au fournisseur et l'applique. `quoi` dit d'ou vient la demande (cron, rappel, main). */
export async function synchroniserTransfert(id: string, quoi = "verification") {
    const t = await prisma.transfert.findUnique({ where: { id } });
    if (!t || (t.statut !== "EN_ATTENTE" && t.statut !== "EN_COURS")) return t;
    if (!t.refFournisseur) return confierAuFournisseur(id); // cree mais jamais confie
    const gateway = t.gatewayId ? await prisma.gateway.findUnique({ where: { id: t.gatewayId } }) : null;
    const fournisseur = fournisseurDe(gateway);
    if (!gateway || !fournisseur?.verifier) return t;
    // Le fournisseur ne connait que SA reference, et on ne l'a jamais recue :
    // impossible d'interroger, interdit de renvoyer. L'envoi reste ouvert, a verifier a la main.
    if (!fournisseur.verifieParNotreReference && t.refFournisseur === t.reference) {
        if (!(t.metadata as any)?.indetermine) {
            await prisma.transfert.update({ where: { id }, data: { metadata: { ...avecJournal(t.metadata, `${quoi}_indetermine`, { raison: "reference fournisseur inconnue" }), indetermine: true } as any } });
        }
        return t;
    }
    const issue = await fournisseur.verifier(configDe(gateway, fournisseur), t.refFournisseur);
    if (issue.notFound) {
        const age = Date.now() - new Date(t.updatedAt).getTime();
        if (age < DELAI_NON_RECU_MS) return t;
        return appliquer(id, { providerReference: t.reference, status: "FAILED", failureCode: "NON_RECU", failureMessage: "Le fournisseur n'a jamais reçu ce transfert. Rien n'a été envoyé." }, `${quoi}_non_recu`);
    }
    return appliquer(id, issue, quoi);
}

/** Tous les transferts encore ouverts : le cron passe ici. */
export async function synchroniserEnCours(limite = 50) {
    const ilYAUneMinute = new Date(Date.now() - 60 * 1000);
    const ouverts = await prisma.transfert.findMany({
        where: { statut: { in: ["EN_ATTENTE", "EN_COURS"] }, updatedAt: { lt: ilYAUneMinute } },
        orderBy: { updatedAt: "asc" }, take: limite, select: { id: true },
    });
    const bilan = { examines: ouverts.length, reussis: 0, echoues: 0, encore: 0, erreurs: 0 };
    for (const { id } of ouverts) {
        try {
            const t = await synchroniserTransfert(id, "cron");
            if (t?.statut === "REUSSI") bilan.reussis += 1;
            else if (t?.statut === "ECHOUE") bilan.echoues += 1;
            else bilan.encore += 1;
        } catch (e: any) {
            bilan.erreurs += 1;
            console.error(`[transferts] synchronisation ${id} :`, e?.message);
        }
    }
    return bilan;
}

/** Ce qu'un rappel dit de l'issue, quand on ne peut pas demander mieux au fournisseur. */
function statutDepuisRappel(p: any): PayoutResponse["status"] {
    const brut = p?.status ?? p?.state ?? p?.treatment_status ?? (p?.success === true ? "success" : p?.success === false ? "failed" : "");
    const s = String(brut).toLowerCase();
    if (["success", "successful", "completed", "complete", "sent", "val", "1", "true", "ok"].includes(s)) return "SUCCESS";
    if (["failed", "failure", "error", "rejected", "rej", "cancelled", "canceled", "0", "false"].includes(s)) return "FAILED";
    return "PENDING";
}

/**
 * Rappel d'un fournisseur (`/api/webhooks/transferts/{cle}`). On retrouve le
 * transfert par les references possibles, puis on demande l'etat au
 * fournisseur quand il le permet ; sinon le rappel fait foi, sans toucher au
 * solde.
 */
export async function traiterCallbackTransfert(cle: string, payload: any): Promise<{ received: boolean; error?: string }> {
    const p = payload?.data && typeof payload.data === "object" && !payload.payoutId ? { ...payload, ...payload.data } : payload || {};
    const texte = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));
    const notres = [p.payoutId, p.disburse_id, p.processing_number, p.reference, p.merchant_reference, p.client_transaction_id, payload?.transfer?.reference, payload?.entity?.merchant_reference].map(texte).filter(Boolean) as string[];
    const leurs = [p.token, p.transaction, p.transfer_code, p.id, payload?.transfer?.id, payload?.entity?.id, payload?.data?.id].map(texte).filter(Boolean) as string[];
    if (notres.length === 0 && leurs.length === 0) return { received: false, error: "Sans référence" };
    const t = await prisma.transfert.findFirst({
        where: { OR: [...(notres.length ? [{ reference: { in: notres } }] : []), ...(leurs.length ? [{ refFournisseur: { in: leurs } }] : [])] },
    });
    if (!t) return { received: false, error: "Transfert inconnu" };
    const fournisseur = FOURNISSEURS.find((f) => f.cle === cle.toLowerCase()) || FOURNISSEURS.find((f) => f.motif.test(cle));
    if (!fournisseur || !fournisseur.motif.test(t.fournisseur || "")) return { received: false, error: "Fournisseur inattendu" };
    try {
        if (fournisseur.verifier) {
            await synchroniserTransfert(t.id, "rappel");
        } else {
            await appliquer(t.id, {
                providerReference: t.refFournisseur || t.reference, status: statutDepuisRappel(p),
                failureMessage: texte(p.message || p.error) || undefined,
                providerTransactionId: texte(p.operator_transaction_id) || undefined, rawData: payload,
            }, "rappel_non_verifie");
        }
    } catch (e: any) {
        console.error(`[transferts] rappel ${cle} :`, e?.message);
    }
    return { received: true };
}

export async function listerTransferts(applicationId: string, options: { statut?: string; limite?: number } = {}) {
    const statut = options.statut && options.statut in STATUT_API ? options.statut : undefined;
    return prisma.transfert.findMany({
        where: { applicationId, ...(statut ? { statut: statut as any } : {}) },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(Number(options.limite) || 50, 1), 200),
    });
}

/** La forme publique d'un transfert, celle de l'API et des webhooks. */
export function versApi(t: any) {
    return {
        id: t.id,
        object: "transfer",
        livemode: true,
        reference: t.reference,
        status: STATUT_API[t.statut] || String(t.statut).toLowerCase(),
        amount: t.montant,
        currency: t.devise,
        fee: t.frais,
        country: t.pays,
        operator: t.operateur,
        provider_operator: t.codeFournisseur || null,
        phone: t.telephone,
        recipient_name: t.nomBeneficiaire || null,
        description: t.motif || null,
        provider: t.fournisseur || null,
        provider_reference: t.refFournisseur && t.refFournisseur !== t.reference ? t.refFournisseur : null,
        failure: t.statut === "ECHOUE" ? { code: t.echecCode || null, message: t.echecMessage || null } : null,
        idempotency_key: t.cleIdempotence || null,
        created: t.createdAt,
        completed: t.termineLe || null,
    };
}
