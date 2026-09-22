"use client";

import { CodeBlock, AlertBox } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionWebhooksSecurity({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="amber">Webhooks</SectionBadge>
            <H1>Sécurité des Webhooks</H1>
            <P>
                Cartflox signe chaque webhook avec une clé HMAC-SHA256 pour garantir que la requête provient
                bien d'Cartflox et n'a pas été altérée en transit.
            </P>

            <H2>Vérification de la signature</H2>
            <P>
                Chaque requête webhook contient le header{" "}
                <code className="font-mono text-[12px] px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(212,212,216,1)" }}>afriflow-signature</code>
                {" "}qui contient le timestamp et la signature HMAC.
            </P>

            <H3>Format du header</H3>
            <CodeBlock lang="bash" code={`afriflow-signature: t=1740823233,v1=5257a869e7ecebeda32affa62cdca3fa...`} />

            <H3>Algorithme de vérification</H3>
            <CodeBlock lang="typescript" title="Vérification manuelle" code={`import crypto from "crypto";

function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const parts = signature.split(",");
  const timestamp = parts.find(p => p.startsWith("t="))?.split("=")[1];
  const hash      = parts.find(p => p.startsWith("v1="))?.split("=")[1];

  if (!timestamp || !hash) return false;

  // Rejeter les événements de plus de 5 minutes (replay attack)
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp));
  if (age > 300) return false;

  // Calculer la signature attendue
  const payload = \`\${timestamp}.\${rawBody}\`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  // Comparaison sécurisée (timing-safe)
  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(expected)
  );
}`} />

            <H3>Avec le SDK (recommandé)</H3>
            <CodeBlock lang="typescript" code={`const event = afriflow.webhooks.constructEvent(
  rawBody,     // string : corps brut de la requête
  signature,   // string : header afriflow-signature
  webhookSecret // string : votre secret de signature
);
// Lance une erreur si la signature est invalide`} />

            <AlertBox type="error">
                N'utilisez jamais <code>req.body</code> parsé par JSON. Vous devez utiliser le <strong>corps brut (raw body)</strong>
                pour la vérification de signature, sinon elle échouera toujours.
            </AlertBox>

            <H2>Protection contre les replay attacks</H2>
            <P>
                Le header contient un timestamp que vous devez valider. Si l'horodatage est trop ancien
                (plus de 5 minutes), rejetez la requête pour prévenir les attaques par rejeu.
            </P>
            <CodeBlock lang="typescript" code={`const MAX_AGE = 5 * 60; // 5 minutes en secondes

const timestamp = parseInt(headerParts.find(p => p.startsWith("t="))!.split("=")[1]);
if (Date.now() / 1000 - timestamp > MAX_AGE) {
  throw new Error("Webhook trop ancien : possible replay attack");
}`} />

            <H2>Bonnes pratiques</H2>
            <div className="flex flex-col gap-2 my-4">
                {[
                    ["✅", "Vérifiez toujours la signature avant de traiter l'événement"],
                    ["✅", "Validez que le timestamp est récent (< 5 minutes)"],
                    ["✅", "Stockez votre secret webhook dans une variable d'environnement"],
                    ["✅", "Répondez rapidement (< 5 s) et traitez en tâche de fond si nécessaire"],
                    ["❌", "Ne pas ignorer les erreurs de signature"],
                    ["❌", "Ne pas faire confiance à l'URL de redirection sans vérification API"],
                ].map(([icon, text], i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl text-[13px]"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span>{icon}</span>
                        <span style={{ color: "rgba(161,161,170,1)" }}>{text}</span>
                    </div>
                ))}
            </div>

            <NavButtons
                prev={{ id: "webhooks-events", label: "Événements" }}
                next={{ id: "sdks-node",       label: "SDK Node.js" }}
                setSection={setSection}
            />
        </>
    );
}
