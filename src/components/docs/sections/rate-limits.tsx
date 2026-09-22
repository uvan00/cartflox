"use client";

import { CodeBlock, AlertBox } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionRateLimits({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="amber">Référence</SectionBadge>
            <H1>Limites de taux (Rate Limiting)</H1>
            <P>
                Cartflox applique des limites de débit pour garantir la stabilité de la plateforme.
                Les limites sont appliquées par clé API.
            </P>

            <H2>Limites par plan</H2>
            <div className="rounded-xl overflow-hidden my-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-[12px]">
                    <thead>
                        <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Plan</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Requêtes / minute</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Requêtes / jour</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Webhooks / sec</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ["Sandbox",    "60",    "10 000",   "10"],
                            ["Starter",    "120",   "50 000",   "30"],
                            ["Business",   "600",   "500 000",  "100"],
                            ["Enterprise", "3 000", "Illimité", "500"],
                        ].map(([plan, rpm, rpd, wps], i) => (
                            <tr key={plan} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined }}>
                                <td className="px-4 py-2.5 font-medium text-white">{plan}</td>
                                <td className="px-4 py-2.5 text-emerald-400">{rpm}</td>
                                <td className="px-4 py-2.5" style={{ color: "rgba(161,161,170,1)" }}>{rpd}</td>
                                <td className="px-4 py-2.5" style={{ color: "rgba(161,161,170,1)" }}>{wps}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <H2>Headers de réponse</H2>
            <P>Chaque réponse API inclut des headers indiquant votre utilisation :</P>
            <CodeBlock lang="bash" title="Headers HTTP" code={`X-RateLimit-Limit:     120       # Limite totale par minute
X-RateLimit-Remaining: 87        # Requêtes restantes dans la fenêtre
X-RateLimit-Reset:     1740823293 # Timestamp UNIX de réinitialisation
X-RateLimit-Window:    60         # Durée de la fenêtre en secondes`} />

            <H2>Gestion du dépassement</H2>
            <P>Quand la limite est atteinte, l'API retourne une erreur <code className="font-mono text-[12px] px-1" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(248,113,113,0.9)" }}>429 Too Many Requests</code> avec un header <code className="font-mono text-[12px] px-1" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(212,212,216,1)" }}>Retry-After</code> :</P>
            <CodeBlock lang="json" title="429 Too Many Requests" code={`HTTP/1.1 429 Too Many Requests
Retry-After: 23
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1740823293

{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Limite de débit atteinte. Veuillez attendre 23 secondes.",
    "retryAfter": 23
  }
}`} />

            <H2>Retry avec backoff exponentiel</H2>
            <CodeBlock lang="typescript" code={`async function apiCallWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err.code === "RATE_LIMIT_EXCEEDED" && attempt < maxRetries) {
        const delay = (err.retryAfter ?? Math.pow(2, attempt)) * 1000;
        console.log(\`Rate limit. Retry dans \${delay}ms...\`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retries atteint");
}

// Utilisation
const payment = await apiCallWithRetry(() =>
  afriflow.payments.create({ ... })
);`} />

            <H2>Bonnes pratiques</H2>
            <div className="flex flex-col gap-2 my-4">
                {[
                    ["✅", "Utilisez les webhooks plutôt que le polling pour surveiller les statuts"],
                    ["✅", "Implémentez un backoff exponentiel pour les retries"],
                    ["✅", "Mettez en cache les réponses GET quand c'est possible"],
                    ["✅", "Utilisez des clés d'idempotence pour éviter les doublons en cas de retry"],
                    ["❌", "Ne faites pas de polling en boucle sur les paiements en attente"],
                    ["❌", "Ne créez pas plusieurs paiements identiques simultanément"],
                ].map(([icon, text], i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl text-[13px]"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span>{icon}</span>
                        <span style={{ color: "rgba(161,161,170,1)" }}>{text}</span>
                    </div>
                ))}
            </div>

            <H2>Idempotence</H2>
            <P>Pour les requêtes POST, vous pouvez envoyer un header <code className="font-mono text-[12px] px-1" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(212,212,216,1)" }}>Idempotency-Key</code> pour éviter les doublons en cas de retry :</P>
            <CodeBlock lang="bash" code={`curl -X POST https://api.afriflow.com/v2/payments \\
  -H "Authorization: Bearer af_live_sec_xxxx" \\
  -H "Idempotency-Key: order_ORD-2026-001_attempt_1" \\
  -H "Content-Type: application/json" \\
  -d '{ ... }'`} />
            <P>Si vous renvoyez la même clé d'idempotence dans les 24h, Cartflox retourne le résultat de la première requête sans re-créer de paiement.</P>

            <NavButtons
                prev={{ id: "errors",    label: "Codes d'erreur" }}
                next={{ id: "changelog", label: "Changelog" }}
                setSection={setSection}
            />
        </>
    );
}
