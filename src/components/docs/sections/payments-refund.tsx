"use client";

import { CodeBlock, ApiEndpoint, ParamTable, AlertBox } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionPaymentsRefund({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="purple">Paiements</SectionBadge>
            <H1>Rembourser un paiement</H1>
            <P>Remboursez un paiement complété, entièrement ou partiellement.</P>

            <ApiEndpoint method="POST" path="/v2/payments/:id/refund" description="Créer un remboursement pour un paiement" />

            <H2>Paramètres</H2>
            <ParamTable params={[
                { name: "amount",  type: "integer", required: false, desc: "Montant à rembourser (en centimes). Si omis, remboursement total." },
                { name: "reason",  type: "string",  required: false, desc: "Raison du remboursement : duplicate | fraudulent | requested_by_customer | other" },
                { name: "note",    type: "string",  required: false, desc: "Note interne (non visible par le client)" },
                { name: "metadata", type: "object", required: false, desc: "Données personnalisées" },
            ]} />

            <AlertBox type="info">
                Les remboursements sont traités vers le même moyen de paiement utilisé lors de la transaction originale. 
                Le délai de remboursement dépend de l'opérateur (généralement 1-3 jours ouvrables).
            </AlertBox>

            <H2>Exemples</H2>
            <H3>Remboursement total</H3>
            <CodeBlock lang="typescript" code={`const refund = await afriflow.payments.refund("pi_01HXYZ789ABC");

console.log(refund.status);  // "processing"`} />

            <H3>Remboursement partiel</H3>
            <CodeBlock lang="typescript" code={`const refund = await afriflow.payments.refund("pi_01HXYZ789ABC", {
  amount: 10000, // Rembourser 100 XOF sur 250 XOF
  reason: "requested_by_customer",
  note: "Remboursement partiel suite à réclamation client #TKT-456"
});`} />

            <H3>cURL</H3>
            <CodeBlock lang="bash" code={`curl -X POST https://api.afriflow.com/v2/payments/pi_01HXYZ789ABC/refund \\
  -H "Authorization: Bearer af_live_sec_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": 10000, "reason": "requested_by_customer" }'`} />

            <H2>Réponse</H2>
            <CodeBlock lang="json" title="200 OK" code={`{
  "success": true,
  "data": {
    "id": "ref_01HABC123",
    "paymentId": "pi_01HXYZ789ABC",
    "status": "processing",
    "amount": 10000,
    "currency": "XOF",
    "reason": "requested_by_customer",
    "createdAt": "2026-03-01T15:30:00Z"
  }
}`} />

            <H2>Conditions de remboursement</H2>
            <div className="grid md:grid-cols-2 gap-3 my-4">
                {[
                    ["✅ Remboursable",    "Paiements complétés (status: completed)"],
                    ["✅ Remboursable",    "Remboursements partiels multiples jusqu'au montant total"],
                    ["❌ Non remboursable", "Paiements en attente ou échoués"],
                    ["❌ Non remboursable", "Paiements de plus de 90 jours (contactez le support)"],
                ].map(([status, desc], i) => (
                    <div key={i} className="p-3 rounded-xl flex gap-3 items-start text-[13px]"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span>{status.split(" ")[0]}</span>
                        <p style={{ color: "rgba(161,161,170,1)" }}>{desc}</p>
                    </div>
                ))}
            </div>

            <NavButtons
                prev={{ id: "payments-list", label: "Lister les paiements" }}
                next={{ id: "transfers",     label: "Transferts d'argent" }}
                setSection={setSection}
            />
        </>
    );
}
