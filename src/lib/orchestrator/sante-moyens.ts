/**
 * SANTE DES MOYENS DE PAIEMENT (25/09/2026). Demande du proprietaire : « verifie
 * a quel moment les moyens de paiement des differentes passerelles deconnent,
 * route automatiquement vers ceux qui fonctionnent ; s'il n'y en a pas, le moyen
 * reste affiche mais indisponible, et quand il redevient disponible il se
 * degrise ».
 *
 * Un moyen = un operateur dans un pays (« mtn » au Cameroun). Il peut etre en
 * panne a deux niveaux, chacun une ligne de la table SanteMoyen (pas de ligne =
 * disponible) :
 *  - chez un FOURNISSEUR (cle = « pawapay ») : l'operateur est ferme chez
 *    l'agregateur, pour tous ses marchands. Source « api » : l'agregateur le dit
 *    lui-meme (PawaPay /v2/availability, relu toutes les 2 minutes par le cron
 *    /api/cron/sante-moyens) ; source « refus » : un paiement vient d'etre
 *    refuse pour cette raison (CORRESPONDENT_TEMPORARILY_UNAVAILABLE), marque
 *    pour 10 minutes.
 *  - sur un COMPTE (cle = « gw:<id de passerelle> ») : pour les refus propres a
 *    un compte marchand.
 * Une ligne « refus » expire seule, le moyen est alors de nouveau propose et le
 * prochain paiement fait office de test ; une ligne « api » vit tant que
 * l'agregateur la confirme et disparait des qu'il redit OPERATIONAL.
 *
 * Servent : la liste des moyens du checkout (moyen grise, puis degrise), le
 * choix de la passerelle de depart dans /api/checkout/initiate (depart d'une
 * passerelle saine), et le tri des secours.
 *
 * Tout echoue en OUVERT : table absente, base lente ou agregateur muet, et le
 * moyen est considere disponible. Mieux vaut essayer un paiement que bloquer
 * sur une information perimee.
 */
import prisma from "@/lib/db";
import { PROVIDER_METHODS, cleFournisseurDuNom, getOperatorKey, passerelleSertLeMoyen } from "@/lib/catalogue-moyens";
import { ISO3_VERS_ISO2 } from "@/lib/pays-devises";

export type EtatMoyen = "DISPONIBLE" | "DEGRADE" | "INDISPONIBLE";
export type MoyenVise = { operateur: string; pays: string; libelle: string };
type Ligne = { etat: EtatMoyen; source: string; detail: string | null; depuis: Date };
export type Sante = Map<string, Ligne>;
type Passerelle = { id: string; name: string; countries?: string[] | null };
type DispoPawaPay = { country?: string; providers?: { provider?: string; operationTypes?: Record<string, string> }[] }[];
const message = (e: unknown) => String((e as Error)?.message || e);

const CACHE_MS = 20_000;
/** Une ligne « api » que le cron n'a pas reconfirmee depuis 30 min ne compte plus. */
const API_PERIMEE_MS = 30 * 60_000;
/** Duree d'un marquage sur refus : au-dela, le moyen est de nouveau propose. */
export const DUREE_REFUS_MS = 10 * 60_000;
/** Un refus recent n'est pas efface par un « OPERATIONAL » de l'agregateur avant ce delai (son etat publie a du retard). */
const REFUS_PROTEGE_MS = 5 * 60_000;

/** Codes de refus qui disent « l'operateur est ferme chez l'agregateur », pas « ce client ne peut pas payer ». */
export const CODES_OPERATEUR_FERME = new Set(["CORRESPONDENT_TEMPORARILY_UNAVAILABLE", "PROVIDER_TEMPORARILY_UNAVAILABLE"]);

let cache: { a: number; lignes: Sante } | null = null;
const cleLigne = (cle: string, pays: string, operateur: string) => `${cle}|${String(pays).toUpperCase()}|${operateur}`;

/** Les moyens en panne en ce moment, gardes 20 s par processus. */
export async function lireSante(forcer = false): Promise<Sante> {
    if (!forcer && cache && Date.now() - cache.a < CACHE_MS) return cache.lignes;
    const lignes: Sante = new Map();
    try {
        const maintenant = new Date();
        const rows = await prisma.santeMoyen.findMany({
            where: {
                OR: [
                    { source: "api", verifieLe: { gt: new Date(Date.now() - API_PERIMEE_MS) } },
                    { source: { not: "api" }, jusqua: { gt: maintenant } },
                ],
            },
        });
        for (const r of rows) lignes.set(cleLigne(r.cle, r.pays, r.operateur), { etat: r.etat as EtatMoyen, source: r.source, detail: r.detail, depuis: r.depuis });
    } catch { /* table absente ou base lente : tout est disponible */ }
    cache = { a: Date.now(), lignes };
    return lignes;
}

/**
 * L'operateur et le pays d'un code de moyen (« ORANGE_CMR », « mtn-cameroun »,
 * « orange-money-ci »), cherches dans tout le catalogue. La carte n'est pas
 * suivie ici : elle n'a ni pays ni operateur au sens mobile money.
 */
export function moyenDuCode(code: string, paysClient?: string | null): MoyenVise | null {
    const c = String(code || "").toLowerCase().trim();
    if (!c) return null;
    for (const moyens of Object.values(PROVIDER_METHODS)) {
        for (const m of moyens as { code?: string; name: string; flag?: string; type?: string }[]) {
            if (String(m.code || "").toLowerCase() !== c) continue;
            const operateur = getOperatorKey(m.name);
            if (operateur === "card" || m.type === "CARD") return null;
            const pays = String(m.flag || paysClient || "").toUpperCase();
            if (!/^[A-Z]{2}$/.test(pays)) return null;
            return { operateur, pays, libelle: String(m.name) };
        }
    }
    return null;
}

/** L'etat d'un moyen chez une passerelle : panne du fournisseur, ou de ce compte. */
export function etatDuMoyen(passerelle: Passerelle, moyen: MoyenVise, sante: Sante): { etat: EtatMoyen; detail?: string | null } {
    const fournisseur = cleFournisseurDuNom(passerelle.name) || "";
    const a = fournisseur ? sante.get(cleLigne(fournisseur, moyen.pays, moyen.operateur)) : undefined;
    const b = sante.get(cleLigne(`gw:${passerelle.id}`, moyen.pays, moyen.operateur));
    if (a?.etat === "INDISPONIBLE") return { etat: "INDISPONIBLE", detail: a.detail };
    if (b?.etat === "INDISPONIBLE") return { etat: "INDISPONIBLE", detail: b.detail };
    if (a?.etat === "DEGRADE" || b?.etat === "DEGRADE") return { etat: "DEGRADE", detail: (a || b)?.detail };
    return { etat: "DISPONIBLE" };
}

/**
 * Un paiement vient d'etre refuse parce que l'operateur est ferme : le moyen
 * passe indisponible 10 minutes chez ce fournisseur (ou ce compte), sans
 * attendre le prochain passage du cron.
 */
export async function signalerIndisponible(x: { cle: string; pays: string; operateur: string; detail: string; dureeMs?: number }): Promise<void> {
    const jusqua = new Date(Date.now() + (x.dureeMs ?? DUREE_REFUS_MS));
    const ou = { cle_pays_operateur: { cle: x.cle, pays: x.pays.toUpperCase(), operateur: x.operateur } };
    try {
        const existant = await prisma.santeMoyen.findUnique({ where: ou });
        // L'agregateur le dit deja lui-meme : sa ligne fait foi et se degrisera seule.
        if (existant?.source === "api" && existant.etat === "INDISPONIBLE") return;
        const detail = String(x.detail || "").slice(0, 300);
        await prisma.santeMoyen.upsert({
            where: ou,
            create: { cle: x.cle, pays: x.pays.toUpperCase(), operateur: x.operateur, etat: "INDISPONIBLE", source: "refus", detail, jusqua },
            update: { etat: "INDISPONIBLE", source: "refus", detail, jusqua, verifieLe: new Date() },
        });
        console.log(`🩺 SANTE: ${x.operateur} ${x.pays} indisponible chez ${x.cle} pour 10 min (${detail})`);
    } catch (e) {
        console.error("[sante] marquage impossible :", message(e));
    }
    cache = null;
}

/**
 * Le depart d'un paiement : si le moyen est indisponible chez la passerelle
 * choisie par la page, une autre passerelle de l'espace qui le sert et qui
 * marche prend la place. Aucune : le moyen est indisponible, on le dit sans
 * rien tenter. Rien de connu (code hors catalogue, carte, aucune panne) : rien
 * ne change.
 */
export async function choisirPasserelleSaine(x: { applicationId: string; gatewayId: string; methodCode: string; pays?: string | null }): Promise<{ gatewayId?: string; nom?: string; depuis?: string; indisponible?: boolean; libelle?: string; message?: string }> {
    const moyen = moyenDuCode(x.methodCode, x.pays);
    if (!moyen) return {};
    const sante = await lireSante();
    if (sante.size === 0) return {};
    const liste: Passerelle[] = await prisma.gateway.findMany({
        where: { applicationId: x.applicationId, status: "active" },
        select: { id: true, name: true, countries: true },
    }).catch(() => []);
    const choisie = liste.find((g) => g.id === x.gatewayId);
    if (!choisie || etatDuMoyen(choisie, moyen, sante).etat !== "INDISPONIBLE") return {};
    const rang = (g: Passerelle) => (etatDuMoyen(g, moyen, sante).etat === "DISPONIBLE" ? 0 : 1);
    const saines = liste
        .filter((g) => g.id !== x.gatewayId && passerelleSertLeMoyen(g, x.methodCode) && etatDuMoyen(g, moyen, sante).etat !== "INDISPONIBLE")
        .sort((a, b) => rang(a) - rang(b));
    if (saines.length > 0) return { gatewayId: saines[0].id, nom: saines[0].name, depuis: choisie.name };
    return {
        indisponible: true,
        libelle: moyen.libelle,
        message: `${moyen.libelle} est momentanément indisponible. Choisissez un autre moyen de paiement ou réessayez dans quelques minutes.`,
    };
}

/* ---------------------------------------------------------------- verification chez les fournisseurs */

type EtatPawaPay = "OPERATIONAL" | "DELAYED" | "CLOSED" | string;

/**
 * Relit la disponibilite publiee par PawaPay (GET /v2/availability, tous les
 * pays du compte en un appel) et met la table a jour : CLOSED devient
 * INDISPONIBLE, DELAYED devient DEGRADE, OPERATIONAL efface la ligne. Une
 * lecture par cle API distincte, plafonnee, car tous les comptes ne couvrent
 * pas les memes pays. Si aucun appel n'aboutit, rien n'est touche.
 */
export async function rafraichirSantePawaPay(): Promise<{ comptes: number; lus: number; indisponibles: string[]; degrades: string[]; degrises: number }> {
    const { buildAdapterConfig } = await import("@/lib/orchestrator/executor");
    const gws = await prisma.gateway.findMany({ where: { status: "active", name: { contains: "pawapay", mode: "insensitive" } } }).catch(() => []);
    const cles = new Map<string, string>();
    for (const g of gws) {
        try {
            // Cles de production seulement (le bac a sable a sa propre disponibilite, fictive).
            const cfg = buildAdapterConfig(g, "pawapay") as { apiKey?: string; mode?: string };
            const cle = String(cfg?.apiKey || "");
            if (!cle || (cfg?.mode || "live") !== "live") continue;
            if (!cles.has(cle)) cles.set(cle, "https://api.pawapay.io");
        } catch { /* passerelle illisible : ignoree */ }
    }

    const etats = new Map<string, { etat: EtatPawaPay; code: string }>();
    let lus = 0;
    for (const [cle, hote] of [...cles.entries()].slice(0, 10)) {
        try {
            const r = await fetch(`${hote}/v2/availability?operationType=DEPOSIT`, {
                headers: { Authorization: `Bearer ${cle}` },
                signal: AbortSignal.timeout(8000),
                cache: "no-store",
            });
            if (!r.ok) continue;
            const j = (await r.json().catch(() => null)) as DispoPawaPay | null;
            if (!Array.isArray(j)) continue;
            lus++;
            for (const pays of j) {
                const iso2 = ISO3_VERS_ISO2[String(pays?.country || "").toUpperCase()];
                if (!iso2) continue;
                for (const p of pays?.providers || []) {
                    const code = String(p?.provider || "");
                    const moyen = moyenDuCode(code, iso2);
                    if (!moyen) continue;
                    const etat = String(p?.operationTypes?.DEPOSIT || "");
                    const k = `${moyen.pays}|${moyen.operateur}`;
                    // Deux comptes, deux reponses : la plus grave l'emporte.
                    const avant = etats.get(k)?.etat;
                    const gravite = (e?: string) => (e === "CLOSED" ? 2 : e === "DELAYED" ? 1 : 0);
                    if (!avant || gravite(etat) > gravite(avant)) etats.set(k, { etat, code });
                }
            }
        } catch { /* ce compte ne repond pas : les autres suffisent */ }
    }

    const resultat = { comptes: cles.size, lus, indisponibles: [] as string[], degrades: [] as string[], degrises: 0 };
    if (lus === 0) return resultat;

    const maintenant = new Date();
    try {
        const existantes = await prisma.santeMoyen.findMany({ where: { cle: "pawapay" } });
        for (const [k, { etat, code }] of etats.entries()) {
            const [pays, operateur] = k.split("|");
            const ou = { cle_pays_operateur: { cle: "pawapay", pays, operateur } };
            if (etat === "CLOSED" || etat === "DELAYED") {
                const etatNous = etat === "CLOSED" ? "INDISPONIBLE" : "DEGRADE";
                (etat === "CLOSED" ? resultat.indisponibles : resultat.degrades).push(`${code}`);
                const deja = existantes.find((e) => e.pays === pays && e.operateur === operateur);
                await prisma.santeMoyen.upsert({
                    where: ou,
                    create: { cle: "pawapay", pays, operateur, etat: etatNous, source: "api", detail: `PawaPay : ${code} ${etat}`, verifieLe: maintenant },
                    update: {
                        etat: etatNous, source: "api", detail: `PawaPay : ${code} ${etat}`, verifieLe: maintenant, jusqua: null,
                        // L'heure de debut de la panne reste celle du premier constat.
                        ...(deja && deja.etat === etatNous ? {} : { depuis: maintenant }),
                    },
                });
            }
        }
        // Retabli selon PawaPay : la ligne « api » disparait, le moyen se degrise.
        // Une ligne « refus » recente est gardee le temps que l'etat publie rattrape.
        for (const e of existantes) {
            const k = `${e.pays}|${e.operateur}`;
            const publie = etats.get(k)?.etat;
            const retabli = publie === "OPERATIONAL" || (publie === undefined && e.source === "api");
            if (!retabli) continue;
            if (e.source !== "api" && maintenant.getTime() - new Date(e.verifieLe).getTime() < REFUS_PROTEGE_MS) continue;
            await prisma.santeMoyen.delete({ where: { id: e.id } }).catch(() => { });
            resultat.degrises++;
        }
        // Menage : les refus expires depuis plus d'un jour.
        await prisma.santeMoyen.deleteMany({ where: { source: { not: "api" }, jusqua: { lt: new Date(Date.now() - 24 * 3600_000) } } }).catch(() => { });
    } catch (e) {
        console.error("[sante] mise a jour PawaPay impossible :", message(e));
    }
    cache = null;
    return resultat;
}
