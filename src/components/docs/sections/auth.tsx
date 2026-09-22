"use client";

import { CodeBlock, AlertBox, ParamTable } from "../code-block";
import { URL_APP } from "@/lib/marque";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionAuth({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="amber">Sécurité</SectionBadge>
            <H1>Authentification & Clés API</H1>
            <P>
                Cartflox utilise des clés API pour authentifier les requêtes. Vous pouvez gérer vos clés API
                depuis votre dashboard → <strong className="text-white">Paramètres → API</strong>.
            </P>

            <H2>Types de clés</H2>
            <div className="grid md:grid-cols-2 gap-4 my-4">
                {[
                    {
                        name: "Clé secrète", prefix: "af_live_sec_",
                        color: "rgba(239,68,68,0.8)", bg: "rgba(239,68,68,0.07)", border: "rgba(239,68,68,0.15)",
                        desc: "Utilisée côté serveur uniquement. Ne jamais exposer dans le frontend. Donne accès à toutes les opérations."
                    },
                    {
                        name: "Clé publique", prefix: "af_live_pub_",
                        color: "rgba(52,211,153,1)", bg: "rgba(52,211,153,0.07)", border: "rgba(52,211,153,0.15)",
                        desc: "Peut être utilisée dans le frontend (initialiser le SDK JS, identifier votre compte). Ne peut pas créer de paiements directement."
                    },
                ].map(k => (
                    <div key={k.name} className="p-4 rounded-xl" style={{ background: k.bg, border: `1px solid ${k.border}` }}>
                        <p className="text-[13px] font-semibold mb-1" style={{ color: k.color }}>{k.name}</p>
                        <code className="text-[11px] font-mono block mb-2" style={{ color: "rgba(212,212,216,0.6)" }}>
                            af_live_sec_... / af_live_pub_...
                        </code>
                        <p className="text-[12px]" style={{ color: "rgba(161,161,170,1)" }}>{k.desc}</p>
                    </div>
                ))}
            </div>

            <AlertBox type="error">
                Ne jamais committer vos clés secrètes dans votre code source. Utilisez des variables d'environnement.
                Si une clé est compromise, révoquez-la immédiatement depuis le dashboard.
            </AlertBox>

            <H2>Utilisation</H2>
            <P>Incluez votre clé secrète dans le header <code className="font-mono text-[12px] px-1 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(212,212,216,1)" }}>Authorization</code> de chaque requête :</P>
            <CodeBlock lang="bash" title="Header HTTP" code={`Authorization: Bearer af_live_sec_xxxxxxxxxxxxxxxxxxxxxxxx`} />

            <H3>Avec curl</H3>
            <CodeBlock lang="bash" code={`curl ${URL_APP}/api/v1/checkout/sessions \\
  -H "Authorization: Bearer af_live_sec_xxxxxxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json"`} />

            <H3>Avec le SDK Node.js</H3>
            <CodeBlock lang="typescript" code={`import Cartflox from "@afriflow/node";

const afriflow = new Cartflox(process.env.AFRIFLOW_SECRET_KEY!);
// Le SDK gère automatiquement l'authentification`} />

            <H2>Environnements</H2>
            <P>Chaque clé est associée à un environnement :</P>
            <div className="rounded-xl overflow-hidden my-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-[12px]">
                    <thead>
                        <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Préfixe</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Environnement</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Base URL</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ["af_sandbox_sec_ / af_sandbox_pub_", "Sandbox",    URL_APP],
                            ["af_live_sec_ / af_live_pub_",       "Production", URL_APP],
                        ].map(([prefix, env, url], i) => (
                            <tr key={prefix} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined }}>
                                <td className="px-4 py-2.5 font-mono" style={{ color: "rgba(212,212,216,1)" }}>{prefix}</td>
                                <td className="px-4 py-2.5 text-white">{env}</td>
                                <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "rgba(113,113,122,1)" }}>{url}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <H2>Rotation des clés</H2>
            <P>Il est recommandé de <strong className="text-white">faire tourner vos clés API tous les 90 jours</strong>. Pour ce faire :</P>
            <ol className="list-decimal list-inside flex flex-col gap-2 my-3 text-[13px]" style={{ color: "rgba(161,161,170,1)" }}>
                <li>Créez une nouvelle clé dans le dashboard</li>
                <li>Mettez à jour vos variables d'environnement en production</li>
                <li>Attendez que votre déploiement soit actif</li>
                <li>Révoquez l'ancienne clé dans le dashboard</li>
            </ol>

            <H2>IP Allowlist (optionnel)</H2>
            <P>Pour une sécurité renforcée, vous pouvez restreindre les requêtes API à une liste d'adresses IP dans <strong className="text-white">Paramètres → Sécurité → IP Allowlist</strong>.</P>

            <NavButtons
                prev={{ id: "quickstart",       label: "Démarrage rapide" }}
                next={{ id: "payments-create",  label: "Créer un paiement" }}
                setSection={setSection}
            />
        </>
    );
}
