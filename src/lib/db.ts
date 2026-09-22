import { PrismaClient } from '@prisma/client'
import { lireVueTest } from '@/lib/donnees-test'
import { masquerSecrets } from '@/lib/secret'

const prismaClientSingleton = () => {
    const url = process.env.DATABASE_URL ?? ''
    const datasourceUrl = url && !url.includes('pgbouncer=true')
        ? (url.includes('?') ? `${url}&pgbouncer=true` : `${url}?pgbouncer=true`)
        : url
    return new PrismaClient({ datasources: { db: { url: datasourceUrl } } })
}

declare const globalThis: {
    prismaGlobal_v10: PrismaClient;
} & typeof global;

/** Client nu, sans la separation test / production. Reserve a ce fichier et a l'authentification. */
export const prismaBase = globalThis.prismaGlobal_v10 ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal_v10 = prismaBase

/*
 * Separation des donnees de test (bac a sable unifie).
 *
 * Toute lecture de LISTE sur les transactions et les livraisons de webhooks
 * (findMany, findFirst, count, aggregate, groupBy) recoit `test: false` si elle
 * ne fixe pas `test` elle-meme. Ainsi les 70 requetes existantes du tableau de
 * bord, de l'admin, des exports et des statistiques ignorent les donnees de
 * test sans avoir ete touchees. Pour lire les deux mondes : `...AVEC_TESTS`.
 *
 * Le monde montre depend de la requete en cours :
 *  1. le cookie du tableau de bord (« voir les donnees de test ») s'il existe ;
 *  2. sinon, un espace en bac a sable (liveMode = false) ne voit que ses tests,
 *     un espace en production que sa production ;
 *  3. sinon (crons, admin sans espace) : la production.
 *
 * Les lectures par identifiant (findUnique) et les ecritures ne sont pas
 * filtrees : une page de paiement ou un webhook doivent trouver leur ligne.
 */
const OPERATIONS_FILTREES = new Set(['findMany', 'findFirst', 'count', 'aggregate', 'groupBy'])

const modeEspace = new Map<string, { direct: boolean; a: number }>()
const MODE_TTL_MS = 15_000

/** A appeler quand un espace change de mode, pour que la vue suive tout de suite. */
export function oublierModeEspace(applicationId: string) {
    modeEspace.delete(applicationId)
}

async function espaceEnDirect(applicationId: string): Promise<boolean> {
    const connu = modeEspace.get(applicationId)
    if (connu && Date.now() - connu.a < MODE_TTL_MS) return connu.direct
    const espace = await prismaBase.application
        .findUnique({ where: { id: applicationId }, select: { liveMode: true } })
        .catch(() => null)
    // Espace inconnu : on ne montre pas de donnees de test par defaut.
    const direct = !espace || espace.liveMode === true
    modeEspace.set(applicationId, { direct, a: Date.now() })
    return direct
}

async function vueTestPour(where: Record<string, unknown>): Promise<boolean> {
    const choix = await lireVueTest()
    if (choix !== null) return choix
    const applicationId = where?.applicationId
    if (typeof applicationId === 'string') return !(await espaceEnDirect(applicationId))
    return false
}

function separationTestProduction() {
    return {
        async $allOperations({ operation, args, query }: { operation: string; args: any; query: (a: any) => Promise<unknown> }) {
            if (!OPERATIONS_FILTREES.has(operation)) return query(args)
            const a = args ?? {}
            const where = (a.where ?? {}) as Record<string, unknown>
            if (Object.prototype.hasOwnProperty.call(where, 'test')) return query(args)
            return query({ ...a, where: { ...where, test: await vueTestPour(where) } })
        },
    }
}

/*
 * Masquage des identifiants durables dans le journal fournisseur.
 *
 * Les 18 ecritures de `ProviderLog` sont eparpillees dans sept fichiers et
 * enregistrent la reponse BRUTE du fournisseur. Certains fournisseurs renvoient
 * la requete en echo dans leurs erreurs, clef d'API comprise. Plutot que de
 * corriger dix-huit appels et d'esperer que le dix-neuvieme y pense, on masque
 * ici : un seul endroit, toutes les ecritures presentes et futures.
 *
 * Les jetons par transaction (`token`, `client_secret`) restent lisibles, sans
 * quoi plus aucun paiement ne serait diagnosticable. Voir `lib/secret.ts`.
 */
function masquageJournalFournisseur() {
    return {
        async $allOperations({ operation, args, query }: { operation: string; args: any; query: (a: any) => Promise<unknown> }) {
            if (operation !== 'create' || !args?.data) return query(args)
            const donnees = args.data as any
            if (!('payload' in donnees)) return query(args)
            return query({ ...args, data: { ...donnees, payload: masquerSecrets(donnees.payload) } })
        },
    }
}

const prisma = prismaBase.$extends({
    name: 'separation-test-production',
    query: {
        transaction: separationTestProduction(),
        webhookDelivery: separationTestProduction(),
        providerLog: masquageJournalFournisseur(),
    },
})

export default prisma
