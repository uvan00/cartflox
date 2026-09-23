import { timingSafeEqual } from "crypto";

/**
 * Les taches planifiees (crontab du serveur) appellent les routes /api/cron/*
 * avec l'en-tete x-cron-secret. Sans CRON_SECRET en place, TOUT est refuse :
 * une variable oubliee sur un nouveau deploiement ne doit pas ouvrir des routes
 * qui envoient des messages, annulent des paiements ou purgent des donnees.
 * Le secret ne se lit que dans l'en-tete, jamais dans l'adresse (journaux nginx).
 */
export function cronAutorise(req: Request): boolean {
    const attendu = process.env.CRON_SECRET || "";
    const recu = req.headers.get("x-cron-secret") || "";
    if (!attendu || recu.length !== attendu.length) return false;
    return timingSafeEqual(Buffer.from(recu), Buffer.from(attendu));
}
