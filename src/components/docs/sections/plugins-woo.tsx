"use client";

import { CodeBlock, AlertBox } from "../code-block";
import { H1, H2, H3, P, SectionBadge, NavButtons } from "./shared";
import type { SectionId } from "@/app/docs/page";

export function SectionPluginsWoo({ setSection }: { setSection: (s: SectionId) => void }) {
    return (
        <>
            <SectionBadge color="purple">Plugins</SectionBadge>
            <H1>Plugin WooCommerce</H1>
            <P>Acceptez les paiements Mobile Money et carte directement dans votre boutique WooCommerce, sans écrire une ligne de code.</P>

            <H2>Installation</H2>
            <H3>Option 1 : Via le dashboard WordPress</H3>
            <ol className="list-decimal list-inside flex flex-col gap-2 my-3 text-[13px]" style={{ color: "rgba(161,161,170,1)" }}>
                <li>Allez dans <strong className="text-white">Extensions → Ajouter</strong></li>
                <li>Recherchez <code className="font-mono text-[11px] px-1" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(212,212,216,1)" }}>Cartflox Payment</code></li>
                <li>Cliquez sur <strong className="text-white">Installer maintenant</strong> puis <strong className="text-white">Activer</strong></li>
            </ol>

            <H3>Option 2 : Installation manuelle</H3>
            <CodeBlock lang="bash" code={`# Télécharger le plugin
curl -L https://downloads.afriflow.com/woocommerce/afriflow-payment-latest.zip -o afriflow-payment.zip

# Dézipper dans le dossier plugins
unzip afriflow-payment.zip -d /var/www/html/wp-content/plugins/`} />

            <H2>Configuration</H2>
            <ol className="list-decimal list-inside flex flex-col gap-2 my-3 text-[13px]" style={{ color: "rgba(161,161,170,1)" }}>
                <li>Allez dans <strong className="text-white">WooCommerce → Réglages → Paiements</strong></li>
                <li>Activez <strong className="text-white">Cartflox Payment</strong></li>
                <li>Cliquez sur <strong className="text-white">Gérer</strong></li>
                <li>Entrez vos clés API (sandbox pour les tests, production pour les vrais paiements)</li>
                <li>Configurez l'URL webhook : copiez l'URL affichée dans WordPress et ajoutez-la dans votre dashboard Cartflox</li>
                <li>Sauvegardez</li>
            </ol>

            <H2>Configuration du webhook</H2>
            <P>L'URL webhook WordPress générée par le plugin :</P>
            <CodeBlock lang="bash" code={`https://votre-boutique.com/wc-api/afriflow_webhook`} />
            <P>Ajoutez cette URL dans votre dashboard Cartflox → <strong className="text-white">Paramètres → Webhooks → Ajouter un endpoint</strong> et sélectionnez tous les événements <code className="font-mono text-[11px] px-1" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(212,212,216,1)" }}>payment.*</code>.</P>

            <H2>Méthodes de paiement disponibles</H2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 my-4">
                {[
                    "Orange Money", "Wave", "MTN MoMo",
                    "Moov Money", "Free Money", "Visa / Mastercard",
                ].map(m => (
                    <div key={m} className="flex items-center gap-2 p-3 rounded-xl text-[13px]"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                        <span style={{ color: "rgba(161,161,170,1)" }}>{m}</span>
                    </div>
                ))}
            </div>

            <H2>Options avancées</H2>
            <div className="rounded-xl overflow-hidden my-4" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-[12px]">
                    <thead>
                        <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Option</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-white">Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ["Titre affiché", "Texte affiché à la caisse (défaut: \"Cartflox Payment\")"],
                            ["Description", "Description affichée sous le titre"],
                            ["Méthodes actives", "Choisir quelles méthodes de paiement afficher"],
                            ["Mode sandbox", "Activer/désactiver le mode test"],
                            ["Logo personnalisé", "Afficher votre logo sur la page de paiement"],
                            ["Couleur de marque", "Couleur principale de la page de paiement"],
                        ].map(([opt, desc], i) => (
                            <tr key={opt} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined }}>
                                <td className="px-4 py-2.5 font-medium text-white">{opt}</td>
                                <td className="px-4 py-2.5" style={{ color: "rgba(161,161,170,1)" }}>{desc}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <AlertBox type="success">
                Le plugin gère automatiquement la mise à jour des statuts de commande WooCommerce lors de la réception des webhooks :
                <br />• <strong>payment.completed</strong> → Statut commande : <em>Traitement</em>
                <br />• <strong>payment.failed</strong> → Statut commande : <em>Échoué</em>
                <br />• <strong>refund.completed</strong> → Statut commande : <em>Remboursé</em>
            </AlertBox>

            <H2>Compatibilité</H2>
            <div className="grid grid-cols-2 gap-2 my-4">
                {[
                    ["WordPress", "5.8+"],
                    ["WooCommerce", "6.0+"],
                    ["PHP", "8.0+"],
                    ["HPOS", "Supporté (High-Performance Order Storage)"],
                ].map(([tech, ver]) => (
                    <div key={tech} className="p-3 rounded-xl flex justify-between items-center"
                        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span className="text-[13px] text-white">{tech}</span>
                        <span className="text-[12px]" style={{ color: "rgba(113,113,122,1)" }}>{ver}</span>
                    </div>
                ))}
            </div>

            <NavButtons
                prev={{ id: "sdks-flutter", label: "SDK Flutter" }}
                next={{ id: "errors",       label: "Codes d'erreur" }}
                setSection={setSection}
            />
        </>
    );
}
