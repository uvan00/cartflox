"use client";

import { CodeBlock, AlertBox } from "../code-block";
import { URL_APP } from "@/lib/marque";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionQuickstart({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="blue">Guide</SectionBadge>
            <H1>Démarrage rapide</H1>
            <P>Intégrez Cartflox et effectuez votre premier paiement en moins de 5 minutes.</P>

            <H2>1. Créer votre compte</H2>
            <P>Rendez-vous sur <strong className="text-white">dashboard.afriflow.com</strong> pour créer un compte. Après inscription, vous avez immédiatement accès à l'environnement sandbox.</P>

            <H2>2. Obtenir vos clés API</H2>
            <P>Dans votre dashboard → <strong className="text-white">Paramètres → API</strong>, copiez votre clé secrète.</P>
            <CodeBlock lang="bash" title=".env" code={`AFRIFLOW_SECRET_KEY=af_live_sec_xxxxxxxxxxxxxxxxxxxxxxxx
AFRIFLOW_PUBLIC_KEY=af_live_pub_xxxxxxxxxxxxxxxxxxxxxxxx
AFRIFLOW_BASE_URL=${URL_APP}`} />

            <H2>3. Créer votre premier paiement</H2>
            <P>Appelez directement l'API REST avec votre clé secrète :</P>
            <CodeBlock lang="typescript" title="payment.ts (Next.js)" code={`const response = await fetch(
  \`\${process.env.AFRIFLOW_BASE_URL}/api/v1/checkout/sessions\`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": \`Bearer \${process.env.AFRIFLOW_SECRET_KEY}\`,
    },
    body: JSON.stringify({
      amount: 5000,
      currency: "XOF",
      customer_name: "Kouassi Jean",
      customer_email: "client@example.com",
      customer_phone: "+22507070707",
      description: "Commande #order_123",
      success_url: "https://monsite.com/paiement/succes",
      cancel_url: "https://monsite.com/paiement/annule",
      metadata: { orderId: "order_123" },
    }),
  }
);

const session = await response.json();

// Rediriger le client vers la page de paiement
console.log(session.url);
// → ${URL_APP}/checkout/cmmtlfj27...`} />

            <AlertBox type="info">
                En mode sandbox, le paiement sera automatiquement <strong>approuvé</strong> si vous utilisez le numéro <code>+22500000001</code>, ou <strong>refusé</strong> avec <code>+22500000002</code>.
            </AlertBox>

            <H2>4. Configurer le webhook</H2>
            <P>Enregistrez votre URL de réception pour être notifié des paiements :</P>
            <CodeBlock lang="bash" code={`curl -X PATCH ${URL_APP}/api/v1/config/webhook \\
  -H "Authorization: Bearer af_live_sec_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "webhookUrl": "https://monsite.com/api/webhooks/afriflow" }'`} />

            <H2>5. Écouter les webhooks</H2>
            <P>Cartflox vous notifie en temps réel du statut de chaque paiement.</P>
            <CodeBlock lang="typescript" title="app/api/webhooks/afriflow/route.ts" code={`import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { event, data } = await req.json();

  if (event === "payment.completed") {
    // ✅ Mettre à jour votre base de données
    await db.orders.update({
      where: { afriflowId: data.id },
      data: { status: "paid" }
    });
  }

  return NextResponse.json({ received: true });
}`} />

            <H2>6. Vérifier le paiement (optionnel)</H2>
            <CodeBlock lang="typescript" code={`const res = await fetch(
  \`\${process.env.AFRIFLOW_BASE_URL}/api/v1/checkout/sessions/\${sessionId}\`,
  { headers: { "Authorization": \`Bearer \${process.env.AFRIFLOW_SECRET_KEY}\` } }
);
const session = await res.json();

if (session.status === "SUCCESS") {
  console.log("Paiement reçu :", session.amount, session.currency);
}`} />

            <AlertBox type="warning">
                Ne jamais accorder l'accès à un service uniquement sur la base de l'URL de redirection. <strong>Vérifiez toujours le statut via webhook ou l'API</strong>.
            </AlertBox>

            <H2>Numéros de test (Sandbox)</H2>
            <div className="rounded-xl overflow-hidden my-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-[12px]">
                    <thead>
                        <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Numéro</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Résultat</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ["+22500000001", "✅ Succès",  "Paiement approuvé immédiatement"],
                            ["+22500000002", "❌ Échec",   "Fonds insuffisants"],
                            ["+22500000003", "⏳ En attente", "Paiement en attente de confirmation (timeout après 30s)"],
                            ["+22500000004", "🚫 Refus",   "Numéro non enregistré auprès de l'opérateur"],
                        ].map(([num, res, desc], i) => (
                            <tr key={num} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined }}>
                                <td className="px-4 py-2.5 font-mono text-white">{num}</td>
                                <td className="px-4 py-2.5">{res}</td>
                                <td className="px-4 py-2.5" style={{ color: "rgba(161,161,170,1)" }}>{desc}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <NavButtons
                prev={{ id: "introduction",   label: "Introduction" }}
                next={{ id: "authentication", label: "Clés API" }}
                setSection={setSection}
            />
        </>
    );
}
