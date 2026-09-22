"use client";

import { CodeBlock, ApiEndpoint, ParamTable, AlertBox } from "../code-block";
import { URL_APP } from "@/lib/marque";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionWebhooksSetup({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="purple">Webhooks</SectionBadge>
            <H1>Configuration des Webhooks</H1>
            <P>
                Les webhooks permettent à Cartflox de notifier votre serveur en temps réel lorsqu'un événement
                se produit (paiement reçu, transfert effectué, remboursement traité…).
            </P>

            <H2>Configurer votre URL webhook</H2>
            <P>Enregistrez l'URL de votre endpoint via l'API ou depuis le dashboard Cartflox.</P>

            <H3>Via l'API (recommandé)</H3>
            <CodeBlock lang="bash" code={`curl -X PATCH ${URL_APP}/api/v1/config/webhook \\
  -H "Authorization: Bearer af_live_sec_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "webhookUrl": "https://monsite.com/api/webhooks/afriflow" }'`} />

            <H3>Vérifier la configuration</H3>
            <CodeBlock lang="bash" code={`curl ${URL_APP}/api/v1/config/webhook \\
  -H "Authorization: Bearer af_live_sec_xxxx"`} />

            <AlertBox type="info">
                Cartflox enverra un <code>POST</code> à votre URL configurée à chaque événement de paiement (succès, échec, mise à jour).
            </AlertBox>

            <AlertBox type="warning">
                Votre endpoint doit répondre avec un code HTTP <strong>2xx</strong> dans les 30 secondes,
                sinon Cartflox considère la livraison comme échouée et retentera automatiquement.
            </AlertBox>

            <H2>Implémenter l'endpoint</H2>
            <H3>Next.js (App Router)</H3>
            <CodeBlock lang="typescript" title="app/api/webhooks/afriflow/route.ts" code={`import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Structure du payload Cartflox
  const { event, data, timestamp } = body;

  switch (event) {
    case "payment.completed":
      // ✅ Mettre à jour votre base de données
      await db.orders.update({
        where: { afriflowId: data.id },
        data: { status: "paid" }
      });
      break;

    case "payment.failed":
      await db.orders.update({
        where: { afriflowId: data.id },
        data: { status: "failed" }
      });
      break;

    case "payment.updated":
      console.log("Statut mis à jour:", data.status);
      break;
  }

  return NextResponse.json({ received: true });
}`} />

            <H3>Express.js</H3>
            <CodeBlock lang="typescript" title="webhook.ts" code={`import express from "express";
import Cartflox from "@afriflow/node";

const app = express();
const afriflow = new Cartflox(process.env.AFRIFLOW_SECRET_KEY!);

// Important: utiliser raw body parser pour les webhooks
app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["afriflow-signature"] as string;

    let event;
    try {
      event = afriflow.webhooks.constructEvent(
        req.body,
        sig,
        process.env.AFRIFLOW_WEBHOOK_SECRET!
      );
    } catch (err) {
      return res.status(400).send("Signature invalide");
    }

    // Traitement
    if (event.type === "payment.completed") {
      console.log("Paiement reçu:", event.data.id);
    }

    res.json({ received: true });
  }
);`} />

            <H2>Logique de retry</H2>
            <P>En cas d'échec, Cartflox retente la livraison selon le calendrier suivant :</P>
            <div className="grid grid-cols-4 gap-2 my-4">
                {[
                    { attempt: "1re", delay: "5 min" },
                    { attempt: "2e",  delay: "30 min" },
                    { attempt: "3e",  delay: "2 h" },
                    { attempt: "4e",  delay: "8 h" },
                ].map(r => (
                    <div key={r.attempt} className="p-3 rounded-xl text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <p className="text-[11px] font-semibold text-white">{r.attempt} retry</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "rgba(113,113,122,1)" }}>après {r.delay}</p>
                    </div>
                ))}
            </div>

            <AlertBox type="info">
                Après 4 échecs consécutifs, l'endpoint est désactivé et vous recevez un email d'alerte.
                Vous pouvez réactiver l'endpoint et rejouer les événements manqués depuis le dashboard.
            </AlertBox>

            <NavButtons
                prev={{ id: "transfers",         label: "Transferts" }}
                next={{ id: "webhooks-events",   label: "Événements" }}
                setSection={setSection}
            />
        </>
    );
}
