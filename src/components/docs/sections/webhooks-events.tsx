"use client";

import { CodeBlock, AlertBox } from "../code-block";
import { URL_APP } from "@/lib/marque";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

const EVENTS = [
    { name: "payment.created",   desc: "Un nouveau paiement a été créé",                 category: "Paiements" },
    { name: "payment.processing",desc: "Le paiement est en cours de traitement",          category: "Paiements" },
    { name: "payment.completed", desc: "Le paiement a été complété avec succès",          category: "Paiements" },
    { name: "payment.failed",    desc: "Le paiement a échoué",                            category: "Paiements" },
    { name: "payment.cancelled", desc: "Le paiement a été annulé par le client",          category: "Paiements" },
    { name: "payment.expired",   desc: "La session de paiement a expiré",                 category: "Paiements" },
    { name: "refund.created",    desc: "Un remboursement a été initié",                   category: "Remboursements" },
    { name: "refund.completed",  desc: "Le remboursement a été traité avec succès",       category: "Remboursements" },
    { name: "refund.failed",     desc: "Le remboursement a échoué",                       category: "Remboursements" },
    { name: "transfer.created",  desc: "Un transfert a été initié",                       category: "Transferts" },
    { name: "transfer.completed","desc": "Le transfert a été effectué avec succès",       category: "Transferts" },
    { name: "transfer.failed",   desc: "Le transfert a échoué",                           category: "Transferts" },
];

export function SectionWebhooksEvents({ setSection }: { setSection: (s: SectionId) => void }) {
    const categories = [...new Set(EVENTS.map(e => e.category))];
    return (
        <>
            <SectionBadge color="purple">Webhooks</SectionBadge>
            <H1>Événements Webhook</H1>
            <P>Liste de tous les événements que vous pouvez écouter via vos endpoints webhook.</P>

            {categories.map(cat => (
                <div key={cat}>
                    <H2>{cat}</H2>
                    <div className="flex flex-col gap-2 my-3">
                        {EVENTS.filter(e => e.category === cat).map(event => (
                            <div key={event.name} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                <code className="text-[12px] font-mono font-medium shrink-0 mt-0.5" style={{ color: "rgba(52,211,153,1)" }}>{event.name}</code>
                                <p className="text-[13px]" style={{ color: "rgba(161,161,170,1)" }}>{event.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <H2>Structure d'un événement</H2>
            <P>Chaque webhook envoyé à votre endpoint a la structure suivante :</P>
            <CodeBlock lang="json" title="Payload webhook" code={`{
  "event": "payment.completed",
  "data": {
    "id": "cmmtlfj27000004l4nuzy1zz5",
    "order_id": "CS-MMTLFJ1Z-B4HEE",
    "status": "SUCCESS",
    "amount": 25000,
    "currency": "XOF",
    "provider": "paydunya",
    "provider_reference": "WAVE-TXN-98765",
    "customer_name": "Kouassi Jean",
    "customer_email": "client@example.com",
    "customer_phone": "+22507070707",
    "metadata": {
      "orderId": "ORD-2026-001"
    },
    "completed_at": "2026-03-01T12:05:33Z"
  },
  "timestamp": "2026-03-01T12:05:33Z"
}`} />

            <H2>Gestion des doublons</H2>
            <P>Cartflox peut parfois envoyer le même événement plusieurs fois (en cas de retry). Utilisez le champ <code className="font-mono text-[12px] px-1" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(212,212,216,1)" }}>id</code> de l'événement pour dédupliquer :</P>
            <CodeBlock lang="typescript" code={`// Stocker les IDs d'événements déjà traités
const processedEvents = new Set<string>();

function handleWebhook(event: CartfloxEvent) {
  if (processedEvents.has(event.id)) {
    console.log("Événement déjà traité:", event.id);
    return;
  }
  
  processedEvents.add(event.id);
  // Traiter l'événement...
}`} />

            <H2>Tester vos webhooks en local</H2>
            <P>Utilisez <strong className="text-white">ngrok</strong> pour exposer votre serveur local :</P>
            <CodeBlock lang="bash" code={`# Installer ngrok et exposer votre port local
ngrok http 3000

# Puis configurer l'URL ngrok comme webhookUrl
curl -X PATCH ${URL_APP}/api/v1/config/webhook \\
  -H "Authorization: Bearer af_live_sec_xxxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "webhookUrl": "https://xxxx.ngrok.io/api/webhooks/afriflow" }'`} />

            <NavButtons
                prev={{ id: "webhooks-setup",    label: "Configuration" }}
                next={{ id: "webhooks-security", label: "Sécurité" }}
                setSection={setSection}
            />
        </>
    );
}
