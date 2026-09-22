"use client";

import { CodeBlock, ApiEndpoint, AlertBox } from "../code-block";
import { URL_APP } from "@/lib/marque";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionPaymentsVerify({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="green">Paiements</SectionBadge>
            <H1>Vérifier un paiement</H1>
            <P>Récupérez les détails et le statut actuel d'un paiement existant.</P>

            <ApiEndpoint method="GET" path="/api/v1/checkout/sessions/:id" description="Récupérer une session de paiement par son identifiant" />

            <H2>Statuts possibles</H2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 my-4">
                {[
                    { status: "pending",    color: "rgba(251,191,36,1)",  bg: "rgba(251,191,36,0.1)",  desc: "En attente de paiement" },
                    { status: "processing", color: "rgba(96,165,250,1)",  bg: "rgba(96,165,250,0.1)",  desc: "Traitement en cours" },
                    { status: "completed",  color: "rgba(52,211,153,1)",  bg: "rgba(52,211,153,0.1)",  desc: "Paiement réussi" },
                    { status: "failed",     color: "rgba(248,113,113,1)", bg: "rgba(239,68,68,0.1)",   desc: "Paiement échoué" },
                    { status: "cancelled",  color: "rgba(113,113,122,1)", bg: "rgba(255,255,255,0.05)", desc: "Annulé par le client" },
                    { status: "refunded",   color: "rgba(192,132,252,1)", bg: "rgba(168,85,247,0.1)",  desc: "Remboursé" },
                ].map(s => (
                    <div key={s.status} className="p-3 rounded-xl" style={{ background: s.bg, border: `1px solid ${s.color}20` }}>
                        <code className="text-[11px] font-mono font-bold block mb-0.5" style={{ color: s.color }}>{s.status}</code>
                        <p className="text-[11px]" style={{ color: "rgba(161,161,170,1)" }}>{s.desc}</p>
                    </div>
                ))}
            </div>

            <H2>Exemple</H2>
            <H3>Node.js</H3>
            <CodeBlock lang="typescript" code={`const payment = await afriflow.payments.retrieve("pi_01HXYZ789ABC");

switch (payment.status) {
  case "completed":
    await fulfillOrder(payment.metadata.orderId);
    break;
  case "failed":
    await notifyCustomerOfFailure(payment.customer.email);
    break;
  default:
    console.log("Statut:", payment.status);
}`} />

            <H3>cURL</H3>
            <CodeBlock lang="bash" code={`curl ${URL_APP}/api/v1/checkout/sessions/cmmtlfj27000004l4nuzy1zz5 \\
  -H "Authorization: Bearer af_live_sec_xxxx"`} />

            <H2>Réponse</H2>
            <CodeBlock lang="json" title="200 OK" code={`{
  "id": "cmmtlfj27000004l4nuzy1zz5",
  "object": "checkout.session",
  "url": "${URL_APP}/checkout/cmmtlfj27000004l4nuzy1zz5",
  "order_id": "CS-MMTLFJ1Z-B4HEE",
  "amount": 25000,
  "currency": "XOF",
  "status": "SUCCESS",
  "created": "2026-03-01T12:00:00Z"
}`} />

            <AlertBox type="warning">
                Préférez toujours les <strong>webhooks</strong> plutôt que le polling pour être notifié du statut d'un
                paiement. Le polling excessif peut entraîner une limitation de débit.
            </AlertBox>

            <NavButtons
                prev={{ id: "payments-create", label: "Créer un paiement" }}
                next={{ id: "payments-list",   label: "Lister les paiements" }}
                setSection={setSection}
            />
        </>
    );
}
