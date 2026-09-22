"use client";

import { CodeBlock, AlertBox } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionSdksNode({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="green">SDK</SectionBadge>
            <H1>SDK Node.js</H1>
            <P>Le SDK officiel Cartflox pour Node.js et TypeScript. Supporte CommonJS et ESM.</P>

            <H2>Installation</H2>
            <CodeBlock lang="bash" code={`npm install @afriflow/node
# ou
yarn add @afriflow/node
# ou
pnpm add @afriflow/node`} />

            <H2>Configuration</H2>
            <CodeBlock lang="typescript" title="lib/afriflow.ts" code={`import Cartflox from "@afriflow/node";

export const afriflow = new Cartflox(process.env.AFRIFLOW_SECRET_KEY!, {
  // Options avancées
  timeout: 30000,        // Timeout en ms (défaut: 30s)
  maxRetries: 3,         // Nombre de retries automatiques
  idempotencyKey: true,  // Générer des clés d'idempotence automatiquement
});`} />

            <H2>Paiements</H2>
            <CodeBlock lang="typescript" code={`// Créer
const payment = await afriflow.payments.create({ ... });

// Récupérer
const payment = await afriflow.payments.retrieve("pi_01HXYZ...");

// Lister
const list = await afriflow.payments.list({ status: "completed", limit: 50 });

// Rembourser
const refund = await afriflow.payments.refund("pi_01HXYZ...", { amount: 5000 });

// Annuler (si en attente)
await afriflow.payments.cancel("pi_01HXYZ...");`} />

            <H2>Transferts</H2>
            <CodeBlock lang="typescript" code={`// Créer un transfert
const transfer = await afriflow.transfers.create({
  amount: 50000,
  currency: "XOF",
  destination: { type: "mobile_money", phone: "+22507070707", network: "wave" }
});

// Récupérer
const transfer = await afriflow.transfers.retrieve("tr_01HABC...");

// Lister
const list = await afriflow.transfers.list({ status: "completed" });`} />

            <H2>Webhooks</H2>
            <CodeBlock lang="typescript" code={`// Vérifier et parser l'événement
const event = afriflow.webhooks.constructEvent(rawBody, signature, secret);

// Accéder aux données
console.log(event.type);    // "payment.completed"
console.log(event.data.id); // "pi_01HXYZ..."

// Types TypeScript disponibles
import type { CartfloxEvent, Payment, Transfer } from "@afriflow/node";`} />

            <H2>TypeScript</H2>
            <P>Le SDK est entièrement typé. Vous bénéficiez de l'autocomplétion et de la validation des types.</P>
            <CodeBlock lang="typescript" code={`import Cartflox, { Payment, CreatePaymentParams } from "@afriflow/node";

const params: CreatePaymentParams = {
  amount: 5000,
  currency: "XOF",
  method: "wave",
  customer: { phone: "+22507070707" }
};

const payment: Payment = await afriflow.payments.create(params);`} />

            <H2>Gestion des erreurs</H2>
            <CodeBlock lang="typescript" code={`import { CartfloxError } from "@afriflow/node";

try {
  const payment = await afriflow.payments.create({ ... });
} catch (err) {
  if (err instanceof CartfloxError) {
    console.error("Code:", err.code);       // INSUFFICIENT_FUNDS
    console.error("Message:", err.message); // "Solde insuffisant"
    console.error("Status:", err.status);   // 400
    console.error("RequestId:", err.requestId);
  }
}`} />

            <H2>Compatibilité</H2>
            <div className="grid grid-cols-2 gap-2 my-4">
                {[
                    ["Node.js", "16, 18, 20, 22"],
                    ["TypeScript", "4.7+"],
                    ["ESM / CJS", "Les deux supportés"],
                    ["Edge Runtime", "Vercel Edge, Cloudflare Workers"],
                ].map(([tech, ver]) => (
                    <div key={tech} className="p-3 rounded-xl flex justify-between items-center"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span className="text-[13px] text-white">{tech}</span>
                        <span className="text-[12px]" style={{ color: "rgba(113,113,122,1)" }}>{ver}</span>
                    </div>
                ))}
            </div>

            <NavButtons
                prev={{ id: "webhooks-security", label: "Sécurité Webhooks" }}
                next={{ id: "sdks-python",       label: "SDK Python" }}
                setSection={setSection}
            />
        </>
    );
}
