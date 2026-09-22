"use client";

import { CodeBlock, AlertBox } from "../code-block";
import { H1, H2, H3, P, InlineCode, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionSmartRouting({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="purple">Smart Routing v1</SectionBadge>
            <H1>Smart Routing : orchestration multi-passerelles</H1>
            <P>
                Cartflox ne se limite pas à transmettre vos paiements à une seule passerelle. Le moteur
                de routage choisit dynamiquement la meilleure passerelle pour chaque paiement, tente
                automatiquement un fallback en cas d'échec, et expose une trace complète de chaque décision.
            </P>
            <AlertBox type="info">
                Le routage se configure depuis le dashboard <InlineCode>/methods?tab=routing</InlineCode> :
                aucun appel API supplémentaire n'est nécessaire. Vos clés marchand restent inchangées.
            </AlertBox>

            <H2>Les 5 algorithmes</H2>
            <P>Choisissez la stratégie adaptée à votre usage. Vous pouvez basculer à tout moment depuis le dashboard.</P>

            <div className="space-y-3 my-4">
                {[
                    {
                        name: "SINGLE",
                        color: "rgba(148,163,184,1)",
                        bg: "rgba(148,163,184,0.06)",
                        desc: "Une seule passerelle, toujours. Aucun fallback. Le plus simple : utile si vous avez une seule intégration.",
                    },
                    {
                        name: "PRIORITY",
                        color: "rgba(96,165,250,1)",
                        bg: "rgba(96,165,250,0.06)",
                        desc: "Liste ordonnée. Essaie la passerelle 1, si échec → passe à la 2, etc. Recommandé pour la plupart des cas : c'est l'algo par défaut.",
                    },
                    {
                        name: "VOLUME_SPLIT",
                        color: "rgba(192,132,252,1)",
                        bg: "rgba(192,132,252,0.06)",
                        desc: "Répartition probabiliste pondérée (ex: 70% PayDunya, 30% PawaPay). Idéal pour A/B tester deux passerelles ou répartir la charge.",
                    },
                    {
                        name: "ADVANCED",
                        color: "rgba(251,191,36,1)",
                        bg: "rgba(251,191,36,0.06)",
                        desc: "Règles métier en DSL : « SI montant > 50000 ET pays = CI ALORS PayDunya ». Première règle correspondante gagne.",
                    },
                    {
                        name: "DYNAMIC",
                        color: "rgba(52,211,153,1)",
                        bg: "rgba(52,211,153,0.06)",
                        desc: "Auto-pilote. Le moteur classe les passerelles par taux de succès récent (EMA) et favorise la plus performante. Mise à jour automatique après chaque paiement.",
                    },
                ].map(a => (
                    <div key={a.name} className="p-4 rounded-xl" style={{ background: a.bg, border: `1px solid ${a.color}25` }}>
                        <p className="text-[13px] font-bold mb-1" style={{ color: a.color }}>{a.name}</p>
                        <p className="text-[12px]" style={{ color: "rgba(161,161,170,1)" }}>{a.desc}</p>
                    </div>
                ))}
            </div>

            <H2>Override par méthode</H2>
            <P>
                Indépendamment de l'algorithme choisi, vous pouvez forcer une passerelle pour une combinaison
                <InlineCode>méthode + pays</InlineCode> spécifique. Exemple : « pour Orange Money CI, utiliser
                toujours PayDunya même si l'algo dit autre chose ». L'override gagne sur l'algorithme.
            </P>

            <H2>Configuration via API (à venir)</H2>
            <P>
                Pour l'instant le routage se configure exclusivement via le dashboard. Une API publique
                <InlineCode>/v2/routing/config</InlineCode> sera exposée prochainement. En attendant, voici le
                modèle de données qu'Cartflox stocke par application :
            </P>
            <CodeBlock lang="json" title="Modèle RoutingConfig" code={`{
  "algorithmKind": "PRIORITY",
  "fallbackOrder": ["gw_paydunya_xxx", "gw_pawapay_yyy"],
  "volumeSplits": [
    { "gatewayId": "gw_paydunya_xxx", "split": 70 },
    { "gatewayId": "gw_pawapay_yyy", "split": 30 }
  ],
  "routingRules": [
    {
      "name": "Gros montants → PayDunya",
      "conditions": [
        { "field": "amount",  "operator": "gt", "value": 50000 },
        { "field": "country", "operator": "eq", "value": "CI" }
      ],
      "gatewayIds": ["gw_paydunya_xxx"]
    }
  ],
  "methodAssignments": {
    "orange_money_ci||CI": "gw_paydunya_xxx"
  },
  "allowedProviders": ["gw_paydunya_xxx", "gw_pawapay_yyy"],
  "maxRetries": 3
}`} />

            <H3>Champs des règles ADVANCED</H3>
            <P>Le DSL accepte les champs suivants :</P>
            <CodeBlock lang="text" code={`amount       : montant numérique de la transaction
currency     : code ISO de la devise (XOF, XAF, USD, …)
country      : code ISO alpha-2 (CI, SN, BJ, …)
methodCode   : code de la méthode (orange_money_ci, mtn_momo_ben, …)
methodType   : MOBILE_MONEY | CARD | BANK_TRANSFER`} />

            <P>Opérateurs supportés :</P>
            <CodeBlock lang="text" code={`eq, neq          : égalité / inégalité
gt, gte, lt, lte : comparaisons numériques (ou lexicographiques pour les strings)
in               : appartenance à une liste (value: ["CI","SN","ML"])`} />

            <H2>Simulateur de routage</H2>
            <P>
                Avant de déployer un changement de config, testez son comportement sans paiement réel.
                Le simulateur (<InlineCode>/methods?tab=routing</InlineCode>) prend en entrée un paiement type
                (montant, pays, méthode) et retourne :
            </P>
            <ul className="text-[14px] leading-relaxed mb-3 list-disc list-inside" style={{ color: "rgba(161,161,170,1)" }}>
                <li>la passerelle qui serait choisie ;</li>
                <li>l'ordre complet des tentatives en cas d'échec ;</li>
                <li>la trace de décision (algo appliqué, override hit, filtres autorisés) ;</li>
                <li>le nombre maximum de tentatives.</li>
            </ul>

            <H2>Audit log des décisions</H2>
            <P>
                Chaque décision de routage est persistée pour debugging et analyse. Visible dans
                <InlineCode>/methods?tab=decisions</InlineCode> : les 50 dernières par défaut, avec :
            </P>
            <ul className="text-[14px] leading-relaxed mb-3 list-disc list-inside" style={{ color: "rgba(161,161,170,1)" }}>
                <li>date · méthode · pays · montant ;</li>
                <li>algorithme appliqué (badge) + indicateur d'override ;</li>
                <li>chaîne complète des passerelles tentées ;</li>
                <li>passerelle finalement choisie ;</li>
                <li>issue : <InlineCode>PENDING</InlineCode> / <InlineCode>SUCCESS</InlineCode> / <InlineCode>FAILED</InlineCode> / <InlineCode>CANCELLED</InlineCode>.</li>
            </ul>
            <AlertBox type="info">
                L'outcome est mis à jour automatiquement lors de la réception du webhook de la passerelle :
                inutile d'écrire du code côté marchand.
            </AlertBox>

            <H2>Bonnes pratiques</H2>
            <div className="space-y-2 my-4">
                {[
                    ["Démarrez en PRIORITY", "C'est l'algo le plus prévisible. Configurez votre passerelle préférée en 1ère position et au moins une de fallback."],
                    ["Validez avec le simulateur", "Avant chaque modification de config en prod, simulez 3-4 paiements types pour valider l'ordre attendu."],
                    ["Activez DYNAMIC après stabilisation", "Une fois que vous avez du volume (>100 paiements/jour), DYNAMIC optimise automatiquement les coûts/succès."],
                    ["Monitorez les décisions", "Consultez l'audit log régulièrement pour repérer les patterns d'échec : ex: une passerelle qui plante toujours sur Orange Money RDC."],
                    ["Réservez ADVANCED aux cas spécifiques", "Les règles DSL sont puissantes mais cassent vite si la config change. Documentez chaque règle."],
                ].map(([t, d]) => (
                    <div key={t} className="p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <p className="text-[13px] font-semibold text-white mb-0.5">{t}</p>
                        <p className="text-[12px]" style={{ color: "rgba(161,161,170,1)" }}>{d}</p>
                    </div>
                ))}
            </div>

            <NavButtons
                prev={{ id: "transfers", label: "Transferts" }}
                next={{ id: "webhooks-setup", label: "Webhooks" }}
                setSection={setSection}
            />
        </>
    );
}
