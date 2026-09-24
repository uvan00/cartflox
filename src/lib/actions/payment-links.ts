"use server";

import prisma from "@/lib/db";
import { qrCartflox } from "@/lib/qr";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { getSelectedAppId } from "./utils";
import { arrondirMontant, formaterMontant } from "@/lib/devises";
import { rateLimit } from "@/lib/rate-limit";
import { ipCourante } from "@/lib/ip-courante";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { getCountryByCode } from "@/lib/countries";

/**
 * Hote qui SERT les pages /pay : `LIENS_PUBLIC_URL` s'il est pose (un domaine
 * court dedie, par exemple), sinon l'adresse de l'application.
 */
const SITE = (process.env.LIENS_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Frais de service de la plateforme, en points de base. */
const FRAIS_BPS = () => Math.max(0, Number(process.env.FRAIS_PASSERELLE_BPS) || 300);

/** Au plus 4 images, chacune une adresse https ou une image encodee. */
function imagesValides(brut: unknown): string[] {
    if (!Array.isArray(brut)) return [];
    return brut
        .map((v) => String(v || "").trim())
        .filter((v) => v.length > 0 && v.length <= 400_000 && (/^https:\/\//i.test(v) || /^data:image\/[a-z+]+;base64,/i.test(v)))
        .slice(0, 4);
}

/**
 * Qui paie les frais de service, pour CE lien.
 *
 * Le choix du lien l'emporte sur celui de l'espace ; `feesOnCustomer` a null
 * signifie « comme mon espace ». Cela ne concerne que les espaces GERES : chez
 * un marchand qui branche ses propres cles, les frais sont ceux de son
 * agregateur, que nous ne facturons pas et ne connaissons pas.
 */
function fraisDuLien(
    base: number,
    devise: string,
    lien: { feesOnCustomer?: boolean | null; application?: { paymentMode?: string | null; fraisClient?: boolean | null } | null },
): { frais: number; total: number; bps: number } {
    const gere = lien.application?.paymentMode === "managed";
    const auClient = lien.feesOnCustomer ?? lien.application?.fraisClient === true;
    if (!gere || !auClient) return { frais: 0, total: base, bps: 0 };
    const bps = FRAIS_BPS();
    const frais = arrondirMontant((base * bps) / 10000, devise);
    return { frais, total: arrondirMontant(base + frais, devise), bps };
}

export async function getPaymentLinks() {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) return [];

        return await prisma.paymentLink.findMany({
            where: { applicationId: appId },
            orderBy: { createdAt: 'desc' }
        });
    } catch (error) {
        console.error("Failed to fetch payment links:", error);
        return [];
    }
}

/**
 * Les liens du marchand avec ce qu'ils ont rapporte : nombre de paiements,
 * reussites, montant encaisse, derniere activite. Un lien "actif" dont la
 * date d'expiration est passee est presente comme expire.
 */
export async function getPaymentLinksAvecStats() {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");
        const appId = await getSelectedAppId();
        if (!appId) return [];

        const [liens, txs] = await Promise.all([
            prisma.paymentLink.findMany({ where: { applicationId: appId }, orderBy: { createdAt: "desc" } }),
            prisma.transaction.findMany({
                where: { applicationId: appId, metadata: { path: ["source"], equals: "Payment Link" } },
                select: { amount: true, status: true, metadata: true, createdAt: true },
            }),
        ]);

        const parLien: Record<string, { paiements: number; reussis: number; encaisse: number; dernier: Date | null }> = {};
        for (const t of txs) {
            const id = (t.metadata as any)?.paymentLinkId;
            if (!id) continue;
            const s = parLien[id] || (parLien[id] = { paiements: 0, reussis: 0, encaisse: 0, dernier: null });
            s.paiements += 1;
            if (t.status === "SUCCESS") { s.reussis += 1; s.encaisse += t.amount; }
            if (!s.dernier || t.createdAt > s.dernier) s.dernier = t.createdAt;
        }
        const maintenant = new Date();
        // Les images sont lourdes (elles sont encodees dans la ligne) : la liste
        // n'en garde que la premiere, en vignette.
        return liens.map(({ images, ...l }: any) => ({
            ...l,
            vignette: imagesValides(images)[0] || null,
            statut: l.status === "active" && l.expiresAt && l.expiresAt < maintenant ? "expired" : l.status,
            url: `${SITE}/pay/${l.slug}`,
            ...(parLien[l.id] || { paiements: 0, reussis: 0, encaisse: 0, dernier: null }),
        }));
    } catch (error) {
        console.error("Failed to fetch payment links with stats:", error);
        return [];
    }
}

export async function createPaymentLink(data: {
    title: string;
    description?: string;
    amount: number;
    currency: string;
    requestPhone?: boolean;
    allowQuantity?: boolean;
    /** Le client saisit lui-meme le montant. `amount` devient une suggestion. */
    amountFree?: boolean;
    amountMin?: number;
    amountMax?: number;
    /** true : le client paie les frais ; false : le marchand ; absent : comme l'espace. */
    feesOnCustomer?: boolean | null;
    images?: string[];
    webhookUrl?: string;
    facebookPixelId?: string;
    googleAdsId?: string;
    customSuccessMessage?: string;
    expiresAt?: Date;
}) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");

        const appId = await getSelectedAppId();
        if (!appId) throw new Error("No application selected");

        const slug = Math.random().toString(36).substring(2, 10);
        // Les bornes et le montant sont re-verifies ici : le formulaire ne prouve rien.
        const devise = String(data.currency || "XOF").toUpperCase();
        const libre = data.amountFree === true;
        const montant = Math.max(0, arrondirMontant(Number(data.amount) || 0, devise));
        const mini = libre ? Math.max(0, arrondirMontant(Number(data.amountMin) || 0, devise)) : 0;
        const maxi = libre ? Math.max(0, arrondirMontant(Number(data.amountMax) || 0, devise)) : 0;
        if (!libre && montant <= 0) throw new Error("Donnez un montant à ce lien, ou laissez le client le choisir.");
        if (maxi > 0 && mini > 0 && maxi < mini) throw new Error("Le montant maximum doit être supérieur au minimum.");

        const paymentLink = await prisma.paymentLink.create({
            data: {
                title: data.title,
                description: data.description,
                currency: devise,
                requestPhone: data.requestPhone,
                allowQuantity: data.allowQuantity,
                webhookUrl: data.webhookUrl,
                facebookPixelId: data.facebookPixelId,
                googleAdsId: data.googleAdsId,
                customSuccessMessage: data.customSuccessMessage,
                expiresAt: data.expiresAt,
                amount: montant,
                amountFree: libre,
                amountMin: mini > 0 ? mini : null,
                amountMax: maxi > 0 ? maxi : null,
                feesOnCustomer: typeof data.feesOnCustomer === "boolean" ? data.feesOnCustomer : null,
                images: imagesValides(data.images),
                applicationId: appId,
                slug,
                status: "active"
            } as any
        });

        revalidatePath("/payment-links");
        // L'adresse publique vient du serveur : l'écran de création ne doit pas la
        // déduire de l'hôte où se trouve le marchand (app. ou connect.), sinon le
        // lien partagé au client ne mène nulle part.
        return { success: true, data: { ...paymentLink, url: `${SITE}/pay/${paymentLink.slug}` } };
    } catch (error) {
        console.error("Failed to create payment link:", error);
        return { success: false, error: "Erreur lors de la création du lien." };
    }
}

/** Verifie que le lien appartient bien a l'espace courant avant d'y toucher. */
async function lienDuMarchand(id: string) {
    const session = await getSession();
    if (!session?.user) throw new Error("Unauthorized");
    const appId = await getSelectedAppId();
    if (!appId) throw new Error("No application selected");
    const lien = await prisma.paymentLink.findFirst({ where: { id, applicationId: appId } });
    if (!lien) throw new Error("Lien introuvable");
    return lien;
}

export async function setPaymentLinkStatus(id: string, status: "active" | "inactive") {
    try {
        await lienDuMarchand(id);
        await prisma.paymentLink.update({ where: { id }, data: { status } });
        revalidatePath("/payment-links");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error?.message || "Modification impossible" };
    }
}

export async function deletePaymentLink(id: string) {
    try {
        await lienDuMarchand(id);
        await prisma.paymentLink.delete({ where: { id } });
        revalidatePath("/payment-links");
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error?.message || "Suppression impossible" };
    }
}

/** QR code de la page de paiement, a imprimer ou a afficher en boutique. */
export async function qrPaymentLink(slug: string) {
    try {
        const session = await getSession();
        if (!session?.user) throw new Error("Unauthorized");
        const dataUrl = await qrCartflox(`${SITE}/pay/${slug}`, 640);
        return { success: true, dataUrl, url: `${SITE}/pay/${slug}` };
    } catch {
        return { success: false as const };
    }
}

/**
 * Le lien tel que le voit un VISITEUR, et rien de plus.
 *
 * Cette action alimente une page publique : elle renvoie donc une forme
 * explicite. Auparavant elle renvoyait la ligne Application entiere, ce qui
 * exposait a tout visiteur la commission du marchand, son mode d'encaissement
 * et son numero de reversement.
 */
export async function getPaymentLinkBySlug(slug: string) {
    try {
        const lien = (await prisma.paymentLink.findUnique({
            where: { slug },
            include: {
                application: {
                    select: {
                        name: true, image: true, paymentMode: true, fraisClient: true, metadata: true,
                        user: { select: { phone: true } },
                        whatsapp: { select: { phoneNumber: true } },
                    } as any,
                },
            },
        })) as any;
        if (!lien) return null;

        const app = lien.application || {};
        const expire = !!(lien.expiresAt && new Date(lien.expiresAt) < new Date());
        return {
            slug: lien.slug,
            title: lien.title,
            description: lien.description,
            amount: Number(lien.amount) || 0,
            currency: lien.currency,
            status: expire ? "expired" : lien.status,
            requestPhone: !!lien.requestPhone,
            allowQuantity: !!lien.allowQuantity,
            amountFree: !!lien.amountFree,
            amountMin: lien.amountMin ? Number(lien.amountMin) : null,
            amountMax: lien.amountMax ? Number(lien.amountMax) : null,
            images: imagesValides(lien.images),
            facebookPixelId: lien.facebookPixelId,
            // Points de base ajoutes au client, 0 si le marchand endosse les frais.
            fraisBps: fraisDuLien(100, lien.currency, lien).bps,
            marchand: {
                nom: app.name || "",
                image: app.image || null,
                whatsapp: app.whatsapp?.phoneNumber || app.user?.phone || null,
            },
            theme: {
                id: (app.metadata as any)?.checkoutTheme || null,
                perso: (app.metadata as any)?.checkoutThemeCustom || null,
            },
        };
    } catch (error) {
        console.error("Failed to fetch payment link:", error);
        return null;
    }
}

export async function initializePaymentLinkTransaction(data: {
    slug: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    quantity: number;
    /** Montant saisi par le client, sur un lien a montant libre. */
    amount?: number;
}) {
    try {
        // Sans session ni limite, cette action creait des transactions avec un
        // numero et un nom libres, repris tels quels dans les messages envoyes
        // ensuite au client (rappel WhatsApp, recu) : un tiers choisissait le
        // texte adresse a la personne visee. Cinq ouvertures par lien et par
        // connexion suffisent.
        const quota = await rateLimit(`lien:${await ipCourante()}:${String(data.slug).slice(0, 80)}`, { limit: 5, windowSec: 600 });
        if (!quota.allowed) throw new Error("Trop de tentatives, patientez quelques minutes.");
        const customerName = String(data.customerName || "").replace(/https?:\/\/\S+/gi, "").replace(/[\/:<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
        const customerEmail = String(data.customerEmail || "").trim().toLowerCase().slice(0, 160);
        const chiffres = String(data.customerPhone || "").replace(/\D/g, "");
        if (customerName.length < 2) throw new Error("Indiquez votre nom");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("Adresse e-mail invalide");
        if (data.customerPhone && (chiffres.length < 8 || chiffres.length > 15)) throw new Error("Numéro de téléphone invalide");
        const link = (await prisma.paymentLink.findUnique({
            where: { slug: data.slug },
            include: { application: { select: { paymentMode: true, fraisClient: true } as any } },
        })) as any;

        if (!link || link.status !== 'active') {
            throw new Error("Lien de paiement introuvable ou inactif");
        }
        if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
            throw new Error("Ce lien de paiement a expiré");
        }

        const devise = String(link.currency || "XOF").toUpperCase();
        const quantite = link.allowQuantity ? Math.min(99, Math.max(1, Math.round(Number(data.quantity) || 1))) : 1;

        // Le prix vient du LIEN, jamais du navigateur. Seule exception : le lien
        // a montant libre, ou le client le fixe, et les bornes sont verifiees
        // ici, cote serveur, parce que celles du formulaire ne prouvent rien.
        let prixUnitaire = arrondirMontant(Number(link.amount) || 0, devise);
        if (link.amountFree) {
            prixUnitaire = arrondirMontant(Number(data.amount) || 0, devise);
            if (prixUnitaire <= 0) throw new Error("Saisissez le montant que vous souhaitez payer");
            if (link.amountMin && prixUnitaire < Number(link.amountMin)) throw new Error(`Le montant minimum est de ${formaterMontant(Number(link.amountMin), devise)}`);
            if (link.amountMax && prixUnitaire > Number(link.amountMax)) throw new Error(`Le montant maximum est de ${formaterMontant(Number(link.amountMax), devise)}`);
        }
        if (prixUnitaire <= 0) throw new Error("Ce lien n'a pas de montant à payer");

        const base = arrondirMontant(prixUnitaire * quantite, devise);
        const { frais, total } = fraisDuLien(base, devise, link);

        const orderId = `ORD-${Math.random().toString(36).substring(2, 15).toUpperCase()}`;

        const transaction = await prisma.transaction.create({
            data: {
                applicationId: link.applicationId,
                orderId,
                amount: total,
                currency: devise,
                status: 'PENDING',
                customerName,
                customerEmail,
                customerPhone: chiffres ? (String(data.customerPhone).trim().startsWith("+") ? `+${chiffres}` : chiffres) : null,
                paymentType: 'MOBILE_MONEY',
                provider: 'cartflox', // En attente du choix de l'opérateur sur la page de paiement
                metadata: {
                    paymentLinkId: link.id,
                    quantity: quantite,
                    source: 'Payment Link',
                    // Meme forme que /api/v1/checkout/sessions : ce que le
                    // marchand encaisse, et ce que le client a paye en plus.
                    ...(frais > 0 ? { base_marchand: base, frais_service: frais } : {}),
                    ...(link.amountFree ? { montant_libre: true } : {}),
                } as any
            }
        });

        return { success: true, transactionId: transaction.id };
    } catch (error: any) {
        console.error("Failed to initialize transaction:", error);
        return { success: false, error: error.message || "Erreur d'initialisation" };
    }
}

/** Le pays d'un numero, d'apres son indicatif : code ISO et nom francais. */
function paysDuNumero(tel?: string | null): { code: string; nom: string } | null {
    const brut = String(tel || "").trim();
    if (!brut) return null;
    try {
        const p = parsePhoneNumberFromString(brut.startsWith("+") ? brut : `+${brut.replace(/\D/g, "")}`);
        if (!p?.country) return null;
        return { code: p.country, nom: getCountryByCode(p.country)?.name || p.country };
    } catch {
        return null;
    }
}

export type ClientDuLien = {
    nom: string;
    email: string;
    telephone: string | null;
    pays: { code: string; nom: string } | null;
    paiements: number;
    reussis: number;
    total: number;
    devise: string;
    premier: Date;
    dernier: Date;
    aPaye: boolean;
    /** Ses derniers paiements sur ce lien, le plus recent d'abord (au plus 5). */
    derniers: { id: string; amount: number; currency: string; status: string; createdAt: Date; quantite: number }[];
};

/**
 * Un lien et tout ce qu'il a produit : ses chiffres et ses clients (une
 * personne = une adresse e-mail, comme dans le repertoire). Les paiements
 * eux-memes se lisent page par page avec `getTransactions({ paymentLinkId })`.
 * Chaque paiement porte l'identifiant de son lien dans ses metadonnees.
 */
export async function getPaymentLinkDetail(id: string) {
    try {
        const session = await getSession();
        if (!session?.user) return null;
        const appId = await getSelectedAppId();
        if (!appId) return null;
        const brut = await prisma.paymentLink.findFirst({ where: { id, applicationId: appId } });
        if (!brut) return null;

        const txs = await prisma.transaction.findMany({
            where: { applicationId: appId, metadata: { path: ["paymentLinkId"], equals: id } } as any,
            select: { id: true, amount: true, currency: true, status: true, createdAt: true, customerName: true, customerEmail: true, customerPhone: true, metadata: true },
            orderBy: { createdAt: "desc" },
        });

        const stats = { paiements: txs.length, reussis: 0, enAttente: 0, echoues: 0, rembourses: 0, encaisse: 0, quantite: 0, dernier: null as Date | null, dernierReussi: null as Date | null, premier: null as Date | null };
        const parEmail = new Map<string, ClientDuLien>();
        for (const t of txs) {
            const quantite = Math.max(1, Math.round(Number((t.metadata as any)?.quantity) || 1));
            if (t.status === "SUCCESS") { stats.reussis += 1; stats.encaisse += t.amount; stats.quantite += quantite; if (!stats.dernierReussi) stats.dernierReussi = t.createdAt; }
            else if (t.status === "PENDING") stats.enAttente += 1;
            else if (t.status === "REFUNDED") stats.rembourses += 1;
            else stats.echoues += 1;
            if (!stats.dernier) stats.dernier = t.createdAt;
            stats.premier = t.createdAt;

            const email = String(t.customerEmail || "").trim().toLowerCase();
            const cle = email || `tel:${t.customerPhone || ""}` || t.id;
            const c = parEmail.get(cle) || (parEmail.set(cle, {
                nom: t.customerName || "Client", email, telephone: t.customerPhone || null, pays: paysDuNumero(t.customerPhone),
                paiements: 0, reussis: 0, total: 0, devise: t.currency, premier: t.createdAt, dernier: t.createdAt, aPaye: false, derniers: [],
            }).get(cle) as ClientDuLien);
            c.paiements += 1;
            if (t.status === "SUCCESS") { c.reussis += 1; c.total += t.amount; c.aPaye = true; }
            if (t.createdAt < c.premier) c.premier = t.createdAt;
            if (t.createdAt > c.dernier) { c.dernier = t.createdAt; c.nom = t.customerName || c.nom; }
            if (!c.telephone && t.customerPhone) { c.telephone = t.customerPhone; c.pays = paysDuNumero(t.customerPhone); }
            if (c.derniers.length < 5) c.derniers.push({ id: t.id, amount: t.amount, currency: t.currency, status: t.status, createdAt: t.createdAt, quantite });
        }
        const clients = [...parEmail.values()].sort((a, b) => b.dernier.getTime() - a.dernier.getTime());

        const maintenant = new Date();
        const { images, ...l } = brut as any;
        return {
            lien: {
                ...l,
                images: imagesValides(images),
                statut: l.status === "active" && l.expiresAt && l.expiresAt < maintenant ? "expired" : l.status,
                url: `${SITE}/pay/${l.slug}`,
            },
            stats: { ...stats, clients: clients.length, clientsPayeurs: clients.filter((c) => c.aPaye).length, taux: txs.length > 0 ? Math.round((stats.reussis / txs.length) * 100) : 0 },
            clients,
        };
    } catch (error) {
        console.error("Failed to fetch payment link detail:", error);
        return null;
    }
}
