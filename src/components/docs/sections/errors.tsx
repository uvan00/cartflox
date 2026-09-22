"use client";

import { CodeBlock, AlertBox } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

const ERRORS = [
    { code: "INVALID_API_KEY",        status: 401, desc: "La clé API est invalide ou a été révoquée." },
    { code: "UNAUTHORIZED",           status: 401, desc: "Authentification requise." },
    { code: "FORBIDDEN",              status: 403, desc: "Vous n'avez pas les droits pour cette opération." },
    { code: "NOT_FOUND",              status: 404, desc: "La ressource demandée est introuvable." },
    { code: "VALIDATION_ERROR",       status: 422, desc: "Les données envoyées sont invalides. Vérifiez les champs requis." },
    { code: "INVALID_AMOUNT",         status: 422, desc: "Le montant est invalide (trop petit, trop grand ou non entier)." },
    { code: "INVALID_CURRENCY",       status: 422, desc: "La devise n'est pas supportée." },
    { code: "INVALID_PHONE",          status: 422, desc: "Le numéro de téléphone est invalide ou non supporté." },
    { code: "METHOD_NOT_AVAILABLE",   status: 422, desc: "La méthode de paiement n'est pas disponible dans ce pays." },
    { code: "INSUFFICIENT_FUNDS",     status: 422, desc: "Le solde du client est insuffisant." },
    { code: "ACCOUNT_NOT_REGISTERED", status: 422, desc: "Le numéro n'est pas enregistré auprès de l'opérateur." },
    { code: "TRANSACTION_LIMIT",      status: 422, desc: "La limite de transaction journalière ou mensuelle est atteinte." },
    { code: "PAYMENT_EXPIRED",        status: 422, desc: "La session de paiement a expiré." },
    { code: "ALREADY_REFUNDED",       status: 422, desc: "Ce paiement a déjà été intégralement remboursé." },
    { code: "REFUND_AMOUNT_EXCEEDED", status: 422, desc: "Le montant de remboursement dépasse le montant payé." },
    { code: "RATE_LIMIT_EXCEEDED",    status: 429, desc: "Trop de requêtes. Attendez avant de réessayer." },
    { code: "PROVIDER_UNAVAILABLE",   status: 503, desc: "L'opérateur de paiement est temporairement indisponible." },
    { code: "INTERNAL_ERROR",         status: 500, desc: "Erreur interne Cartflox. Réessayez ou contactez le support." },
];

const HTTP_CODES = [
    { code: "200 OK",                  desc: "Requête réussie" },
    { code: "201 Created",             desc: "Ressource créée avec succès" },
    { code: "400 Bad Request",         desc: "Requête malformée" },
    { code: "401 Unauthorized",        desc: "Authentification invalide ou manquante" },
    { code: "403 Forbidden",           desc: "Accès refusé" },
    { code: "404 Not Found",           desc: "Ressource introuvable" },
    { code: "422 Unprocessable Entity","desc": "Erreur de validation métier" },
    { code: "429 Too Many Requests",   desc: "Limite de débit dépassée" },
    { code: "500 Internal Server Error","desc": "Erreur côté Cartflox" },
    { code: "503 Service Unavailable", desc: "Service ou opérateur temporairement indisponible" },
];

export function SectionErrors({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="amber">Référence</SectionBadge>
            <H1>Codes d'erreur</H1>
            <P>Lorsqu'une requête échoue, l'API retourne un objet d'erreur structuré avec un code machine et un message lisible.</P>

            <H2>Format d'erreur</H2>
            <CodeBlock lang="json" title="Réponse d'erreur" code={`{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Le solde du compte est insuffisant pour effectuer cette transaction.",
    "details": {
      "field": "customer.phone",
      "value": "+22507070707"
    },
    "requestId": "req_01HXYZ123"
  }
}`} />

            <H2>Codes HTTP</H2>
            <div className="rounded-xl overflow-hidden my-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-[12px]">
                    <thead>
                        <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Code</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Signification</th>
                        </tr>
                    </thead>
                    <tbody>
                        {HTTP_CODES.map((h, i) => {
                            const isError = h.code.startsWith("4") || h.code.startsWith("5");
                            return (
                                <tr key={h.code} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined }}>
                                    <td className="px-4 py-2.5 font-mono font-medium" style={{ color: isError ? "rgba(248,113,113,0.9)" : "rgba(52,211,153,1)" }}>{h.code}</td>
                                    <td className="px-4 py-2.5" style={{ color: "rgba(161,161,170,1)" }}>{h.desc}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <H2>Codes d'erreur métier</H2>
            <div className="rounded-xl overflow-hidden my-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-[12px]">
                    <thead>
                        <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Code</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">HTTP</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ERRORS.map((e, i) => (
                            <tr key={e.code} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined }}>
                                <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "rgba(52,211,153,0.9)" }}>{e.code}</td>
                                <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: e.status >= 500 ? "rgba(248,113,113,0.9)" : e.status >= 400 ? "rgba(251,146,60,0.9)" : "rgba(52,211,153,1)" }}>{e.status}</td>
                                <td className="px-4 py-2.5" style={{ color: "rgba(161,161,170,1)" }}>{e.desc}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <H2>Gestion des erreurs côté client</H2>
            <CodeBlock lang="typescript" code={`import Cartflox, { CartfloxError } from "@afriflow/node";

try {
  const payment = await afriflow.payments.create({ ... });
} catch (err) {
  if (err instanceof CartfloxError) {
    switch (err.code) {
      case "INSUFFICIENT_FUNDS":
        return res.status(400).json({ message: "Solde insuffisant, veuillez recharger votre compte." });
      case "ACCOUNT_NOT_REGISTERED":
        return res.status(400).json({ message: "Ce numéro n'est pas enregistré sur ce réseau." });
      case "METHOD_NOT_AVAILABLE":
        return res.status(400).json({ message: "Cette méthode n'est pas disponible dans votre pays." });
      case "RATE_LIMIT_EXCEEDED":
        // Retry après un délai
        await sleep(1000);
        return retryPayment();
      default:
        // Erreur inattendue : logguer et afficher message générique
        logger.error("Cartflox error", { code: err.code, requestId: err.requestId });
        return res.status(500).json({ message: "Une erreur est survenue. Veuillez réessayer." });
    }
  }
  throw err; // Re-throw si ce n'est pas une erreur Cartflox
}`} />

            <NavButtons
                prev={{ id: "plugins-woo", label: "Plugin WooCommerce" }}
                next={{ id: "rate-limits", label: "Limites de taux" }}
                setSection={setSection}
            />
        </>
    );
}
