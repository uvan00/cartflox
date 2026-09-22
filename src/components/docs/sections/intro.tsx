"use client";

import { CheckCircle2 } from "lucide-react";
import { CodeBlock, AlertBox } from "../code-block";
import { H1, H2, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionIntro({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="green">Documentation Cartflox v2.0</SectionBadge>
            <H1>Introduction à l'API Cartflox</H1>
            <P>
                Cartflox est une API de paiement panafricaine qui vous permet d'accepter des paiements
                Mobile Money (Orange Money, Wave, MTN MoMo, Moov) et carte bancaire, ainsi que d'effectuer
                des transferts d'argent dans plus de 15 pays africains : avec une seule intégration.
            </P>
            <AlertBox type="success">
                L'API Cartflox est disponible en <strong>mode sandbox</strong> et <strong>production</strong>.
                Utilisez vos clés sandbox pour tester sans effectuer de vrais paiements.
            </AlertBox>

            <H2>Fonctionnalités principales</H2>
            <div className="grid md:grid-cols-2 gap-3 my-4">
                {[
                    ["Paiements Mobile Money", "Orange Money, Wave, MTN MoMo, Moov, Airtel, Free Money…"],
                    ["Paiements par carte",    "Visa, Mastercard via notre passerelle sécurisée PCI DSS"],
                    ["Smart Routing",          "5 algorithmes (Priority, Volume Split, DSL, Dynamic) + fallback automatique"],
                    ["Transferts d'argent",    "Envoi de fonds vers des comptes Mobile Money et bancaires"],
                    ["Webhooks temps réel",    "Notifications instantanées sur l'état de vos transactions"],
                    ["Personnalisation",       "Page de paiement entièrement brandée à votre identité"],
                    ["SDKs multi-langages",    "Node.js, Python, PHP, Flutter, React Native"],
                    ["Audit log complet",      "Traçabilité de chaque décision de routage pour debug en prod"],
                ].map(([title, desc]) => (
                    <div key={title} className="p-4 rounded-xl flex items-start gap-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "rgba(52,211,153,1)" }} />
                        <div>
                            <p className="text-[13px] font-semibold text-white">{title}</p>
                            <p className="text-[12px] mt-0.5" style={{ color: "rgba(113,113,122,1)" }}>{desc}</p>
                        </div>
                    </div>
                ))}
            </div>

            <H2>Base URL</H2>
            <P>Toutes les requêtes API doivent être effectuées en HTTPS :</P>
            <CodeBlock lang="bash" title="Endpoints" code={`# Sandbox (tests)
https://sandbox.api.afriflow.com/v2

# Production
https://api.afriflow.com/v2`} />

            <H2>Format des réponses</H2>
            <P>Toutes les réponses sont au format JSON avec la structure suivante :</P>
            <CodeBlock lang="json" title="Réponse type" code={`{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_01HXYZ...",
    "timestamp": "2026-03-01T12:00:00Z"
  }
}

// En cas d'erreur :
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "Le solde du compte est insuffisant.",
    "details": {}
  }
}`} />

            <H2>Environnements</H2>
            <div className="grid md:grid-cols-2 gap-4 my-4">
                {[
                    { name: "Sandbox", color: "rgba(251,191,36,1)", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.2)", desc: "Pour les tests. Aucun vrai argent n'est débité. Utilisez les numéros de test fournis." },
                    { name: "Production", color: "rgba(52,211,153,1)", bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.2)", desc: "Pour les vrais paiements. Nécessite la validation KYB de votre compte." },
                ].map(env => (
                    <div key={env.name} className="p-4 rounded-xl" style={{ background: env.bg, border: `1px solid ${env.border}` }}>
                        <p className="text-[13px] font-semibold mb-1" style={{ color: env.color }}>{env.name}</p>
                        <p className="text-[12px]" style={{ color: "rgba(161,161,170,1)" }}>{env.desc}</p>
                    </div>
                ))}
            </div>

            <NavButtons
                next={{ id: "quickstart", label: "Démarrage rapide" }}
                setSection={setSection}
            />
        </>
    );
}
