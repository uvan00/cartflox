"use client";

import { CodeBlock, ApiEndpoint, ParamTable, AlertBox } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionTransfers({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="blue">Transferts</SectionBadge>
            <H1>Transfert d'argent</H1>
            <P>Envoyez des fonds directement vers des comptes Mobile Money ou bancaires dans toute l'Afrique.</P>

            <AlertBox type="warning">
                Les transferts nécessitent un compte vérifié (KYB complet) et un solde suffisant sur votre compte Cartflox.
                Contactez notre équipe pour activer cette fonctionnalité.
            </AlertBox>

            <ApiEndpoint method="POST" path="/v2/transfers" description="Initier un transfert d'argent" />

            <H2>Paramètres</H2>
            <ParamTable params={[
                { name: "amount",       type: "integer", required: true,  desc: "Montant en centimes à transférer" },
                { name: "currency",     type: "string",  required: true,  desc: "Devise du transfert (XOF, XAF, GHS…)" },
                { name: "destination",  type: "object",  required: true,  desc: "Informations du destinataire (voir ci-dessous)" },
                { name: "description",  type: "string",  required: false, desc: "Description du transfert" },
                { name: "reference",    type: "string",  required: false, desc: "Référence unique pour éviter les doublons (idempotency key)" },
                { name: "metadata",     type: "object",  required: false, desc: "Données personnalisées" },
            ]} />

            <H3>Objet destination</H3>
            <ParamTable params={[
                { name: "type",    type: "string", required: true,  desc: "mobile_money | bank_account" },
                { name: "phone",   type: "string", required: false, desc: "Numéro Mobile Money (requis si type=mobile_money)" },
                { name: "network", type: "string", required: false, desc: "Opérateur : wave | orange-money | mtn-momo | moov | airtel" },
                { name: "iban",    type: "string", required: false, desc: "IBAN du compte bancaire (si type=bank_account)" },
                { name: "name",    type: "string", required: false, desc: "Nom du destinataire" },
                { name: "country", type: "string", required: false, desc: "Code pays ISO (ex: CI, SN)" },
            ]} />

            <H2>Exemples</H2>
            <H3>Transfert Mobile Money</H3>
            <CodeBlock lang="typescript" code={`const transfer = await afriflow.transfers.create({
  amount: 50000,
  currency: "XOF",
  destination: {
    type: "mobile_money",
    phone: "+22507070707",
    network: "orange-money",
    name: "Kouassi Jean",
    country: "CI"
  },
  description: "Paiement fournisseur Mars 2026",
  reference: "PAY-2026-03-001" // Unique - évite les doublons
});

console.log(transfer.status); // "processing"`} />

            <H3>Transfert bancaire</H3>
            <CodeBlock lang="typescript" code={`const transfer = await afriflow.transfers.create({
  amount: 500000,
  currency: "XOF",
  destination: {
    type: "bank_account",
    iban: "CI00XY1234567890123456789",
    name: "Société XYZ SARL",
    country: "CI"
  },
  description: "Virement salaire Mars 2026"
});`} />

            <H2>Réponse</H2>
            <CodeBlock lang="json" title="200 OK" code={`{
  "success": true,
  "data": {
    "id": "tr_01HABC456DEF",
    "status": "processing",
    "amount": 50000,
    "currency": "XOF",
    "fee": 500,
    "netAmount": 49500,
    "destination": {
      "type": "mobile_money",
      "phone": "+22507070707",
      "network": "orange-money",
      "name": "Kouassi Jean"
    },
    "estimatedArrival": "2026-03-01T13:00:00Z",
    "reference": "PAY-2026-03-001",
    "createdAt": "2026-03-01T12:00:00Z"
  }
}`} />

            <H2>Récupérer un transfert</H2>
            <ApiEndpoint method="GET" path="/v2/transfers/:id" description="Vérifier le statut d'un transfert" />
            <CodeBlock lang="typescript" code={`const transfer = await afriflow.transfers.retrieve("tr_01HABC456DEF");
console.log(transfer.status); // processing | completed | failed`} />

            <H2>Frais de transfert</H2>
            <div className="rounded-xl overflow-hidden my-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-[12px]">
                    <thead>
                        <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Type</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Frais</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Min</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ["Mobile Money (même pays)", "0.8% du montant", "50 XOF"],
                            ["Mobile Money (international)", "1.5% du montant", "100 XOF"],
                            ["Virement bancaire (UEMOA)", "0.5% du montant", "200 XOF"],
                        ].map(([type, fee, min], i) => (
                            <tr key={type} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined }}>
                                <td className="px-4 py-2.5 text-white">{type}</td>
                                <td className="px-4 py-2.5 text-emerald-400">{fee}</td>
                                <td className="px-4 py-2.5" style={{ color: "rgba(113,113,122,1)" }}>{min}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <NavButtons
                prev={{ id: "payments-refund", label: "Rembourser" }}
                next={{ id: "webhooks-setup", label: "Webhooks : Configuration" }}
                setSection={setSection}
            />
        </>
    );
}
