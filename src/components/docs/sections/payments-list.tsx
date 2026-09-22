"use client";

import { CodeBlock, ApiEndpoint, ParamTable } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionPaymentsList({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="green">Paiements</SectionBadge>
            <H1>Lister les paiements</H1>
            <P>Récupérez la liste paginée de tous vos paiements avec des filtres avancés.</P>

            <ApiEndpoint method="GET" path="/v2/payments" description="Lister les paiements avec filtres et pagination" />

            <H2>Paramètres de requête</H2>
            <ParamTable params={[
                { name: "limit",      type: "integer", desc: "Nombre de résultats par page (défaut: 20, max: 100)" },
                { name: "cursor",     type: "string",  desc: "Curseur de pagination (retourné dans la réponse précédente)" },
                { name: "status",     type: "string",  desc: "Filtrer par statut : pending | completed | failed | cancelled | refunded" },
                { name: "method",     type: "string",  desc: "Filtrer par méthode de paiement" },
                { name: "currency",   type: "string",  desc: "Filtrer par devise (ex: XOF, XAF)" },
                { name: "from",       type: "string",  desc: "Date de début ISO 8601 (ex: 2026-01-01T00:00:00Z)" },
                { name: "to",         type: "string",  desc: "Date de fin ISO 8601" },
                { name: "customerId", type: "string",  desc: "Filtrer par identifiant client" },
            ]} />

            <H2>Exemple</H2>
            <H3>Node.js</H3>
            <CodeBlock lang="typescript" code={`const payments = await afriflow.payments.list({
  limit: 20,
  status: "completed",
  currency: "XOF",
  from: "2026-01-01T00:00:00Z",
  to:   "2026-03-01T23:59:59Z"
});

for (const payment of payments.data) {
  console.log(payment.id, payment.amount, payment.status);
}

// Pagination
if (payments.hasMore) {
  const nextPage = await afriflow.payments.list({
    cursor: payments.nextCursor
  });
}`} />

            <H3>cURL</H3>
            <CodeBlock lang="bash" code={`curl "https://api.afriflow.com/v2/payments?limit=20&status=completed&currency=XOF" \\
  -H "Authorization: Bearer af_live_sec_xxxx"`} />

            <H2>Réponse</H2>
            <CodeBlock lang="json" title="200 OK" code={`{
  "success": true,
  "data": [
    {
      "id": "pi_01HXYZ789ABC",
      "status": "completed",
      "amount": 25000,
      "currency": "XOF",
      "method": "wave",
      "customer": { "phone": "+22507070707" },
      "createdAt": "2026-03-01T12:00:00Z"
    },
    { ... }
  ],
  "meta": {
    "total": 1543,
    "count": 20,
    "hasMore": true,
    "nextCursor": "cursor_eyJpZCI6InBpXzAxSFhZ..."
  }
}`} />

            <NavButtons
                prev={{ id: "payments-verify", label: "Vérifier un paiement" }}
                next={{ id: "payments-refund", label: "Rembourser" }}
                setSection={setSection}
            />
        </>
    );
}
