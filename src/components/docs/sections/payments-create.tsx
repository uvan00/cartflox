"use client";

import { CodeBlock, AlertBox, ApiEndpoint, ParamTable } from "../code-block";
import { URL_APP } from "@/lib/marque";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionPaymentsCreate({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="green">Paiements</SectionBadge>
            <H1>Créer un paiement</H1>
            <P>Initialisez une session de paiement et redirigez votre client vers la page de paiement Cartflox.</P>

            <ApiEndpoint method="POST" path="/api/v1/checkout/sessions" description="Créer une nouvelle session de paiement" />

            <H2>Paramètres</H2>
            <ParamTable params={[
                { name: "amount",          type: "integer", required: true,  desc: "Montant entier (ex: 5000 XOF)" },
                { name: "currency",        type: "string",  required: false, desc: "Code ISO 4217 : XOF, XAF, GHS, KES… (défaut : XOF)" },
                { name: "customer_name",   type: "string",  required: false, desc: "Nom complet du client" },
                { name: "customer_email",  type: "string",  required: false, desc: "Email du client" },
                { name: "customer_phone",  type: "string",  required: false, desc: "Téléphone du client au format international" },
                { name: "description",     type: "string",  required: false, desc: "Description affichée sur la page de paiement" },
                { name: "success_url",     type: "string",  required: false, desc: "URL de redirection après paiement réussi" },
                { name: "cancel_url",      type: "string",  required: false, desc: "URL de redirection si le client annule" },
                { name: "metadata",        type: "object",  required: false, desc: "Données personnalisées retournées dans les webhooks" },
            ]} />

            <H3>Objet customer</H3>
            <ParamTable params={[
                { name: "phone",   type: "string", required: true,  desc: "Numéro de téléphone au format international (+22507…)" },
                { name: "email",   type: "string", required: false, desc: "Adresse email du client" },
                { name: "name",    type: "string", required: false, desc: "Nom complet du client" },
                { name: "country", type: "string", required: false, desc: "Code pays ISO 3166-1 alpha-2 (ex: CI, SN, BJ…)" },
            ]} />

            <H2>Exemples</H2>
            <H3>Node.js</H3>
            <CodeBlock lang="typescript" title="create-payment.ts" code={`const payment = await afriflow.payments.create({
  amount: 25000,
  currency: "XOF",
  method: "wave",
  customer: {
    phone: "+22507070707",
    email: "client@example.com",
    name: "Kouassi Jean"
  },
  description: "Abonnement Premium - Janvier 2026",
  redirectUrl: "https://monsite.com/success",
  cancelUrl: "https://monsite.com/cancel",
  metadata: {
    orderId: "ORD-2026-001",
    userId: "usr_123"
  }
});

// Rediriger le client
res.redirect(payment.checkoutUrl);`} />

            <H3>cURL</H3>
            <CodeBlock lang="bash" code={`curl -X POST ${URL_APP}/api/v1/checkout/sessions \\
  -H "Authorization: Bearer af_live_sec_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "amount": 25000,
    "currency": "XOF",
    "customer_name": "Kouassi Jean",
    "customer_email": "client@example.com",
    "customer_phone": "+22507070707",
    "description": "Abonnement Premium",
    "success_url": "https://monsite.com/success",
    "cancel_url": "https://monsite.com/cancel"
  }'`} />

            <H2>Réponse</H2>
            <CodeBlock lang="json" title="201 Created" code={`{
  "id": "cmmtlfj27000004l4nuzy1zz5",
  "object": "checkout.session",
  "url": "${URL_APP}/checkout/cmmtlfj27000004l4nuzy1zz5",
  "order_id": "CS-MMTLFJ1Z-B4HEE",
  "amount": 25000,
  "currency": "XOF",
  "status": "pending",
  "created": "2026-03-01T12:00:00Z"
}`} />

            <H2>Méthode "auto"</H2>
            <P>
                En utilisant <code className="font-mono text-[12px] px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(212,212,216,1)" }}>method: "auto"</code>,
                Cartflox affiche automatiquement toutes les méthodes disponibles dans le pays du client et laisse
                ce dernier choisir.
            </P>
            <AlertBox type="info">
                Le mode <strong>auto</strong> est recommandé pour maximiser le taux de conversion. Cartflox détecte
                automatiquement le pays via le préfixe du numéro de téléphone.
            </AlertBox>

            <NavButtons
                prev={{ id: "authentication",   label: "Clés API" }}
                next={{ id: "payments-verify",  label: "Vérifier un paiement" }}
                setSection={setSection}
            />
        </>
    );
}
