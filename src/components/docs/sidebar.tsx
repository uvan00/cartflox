"use client";

import { BookOpen, Key, CreditCard, ArrowRight, Webhook, Code2, Package, FileText, Menu, X, GitBranch } from "lucide-react";
import type { SectionId } from "@/app/docs/page";

interface NavSection {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    items: { id: SectionId; label: string }[];
}

export const NAV: NavSection[] = [
    {
        label: "Premiers pas",
        icon: BookOpen,
        items: [
            { id: "introduction", label: "Introduction" },
            { id: "quickstart",   label: "Démarrage rapide" },
        ],
    },
    {
        label: "Authentification",
        icon: Key,
        items: [
            { id: "authentication", label: "Clés API" },
        ],
    },
    {
        label: "Paiements",
        icon: CreditCard,
        items: [
            { id: "payments-create",  label: "Créer un paiement" },
            { id: "payments-verify",  label: "Vérifier un paiement" },
            { id: "payments-list",    label: "Lister les paiements" },
            { id: "payments-refund",  label: "Rembourser" },
        ],
    },
    {
        label: "Transferts",
        icon: ArrowRight,
        items: [
            { id: "transfers", label: "Transfert d'argent" },
        ],
    },
    {
        label: "Smart Routing",
        icon: GitBranch,
        items: [
            { id: "smart-routing", label: "Orchestration multi-passerelles" },
        ],
    },
    {
        label: "Webhooks",
        icon: Webhook,
        items: [
            { id: "webhooks-setup",    label: "Configuration" },
            { id: "webhooks-events",   label: "Événements" },
            { id: "webhooks-security", label: "Sécurité" },
        ],
    },
    {
        label: "SDKs",
        icon: Code2,
        items: [
            { id: "sdks-node",    label: "Node.js" },
            { id: "sdks-python",  label: "Python" },
            { id: "sdks-php",     label: "PHP" },
            { id: "sdks-flutter", label: "Flutter" },
        ],
    },
    {
        label: "Plugins",
        icon: Package,
        items: [
            { id: "plugins-woo", label: "WooCommerce" },
        ],
    },
    {
        label: "Référence",
        icon: FileText,
        items: [
            { id: "errors",      label: "Codes d'erreur" },
            { id: "rate-limits", label: "Limites de taux" },
            { id: "changelog",   label: "Changelog" },
        ],
    },
];

interface Props {
    activeSection: SectionId;
    setActiveSection: (s: SectionId) => void;
    mobileOpen: boolean;
    setMobileOpen: (v: boolean) => void;
}

export function DocsSidebar({ activeSection, setActiveSection, mobileOpen, setMobileOpen }: Props) {
    const inner = (
        <div className="w-64 shrink-0 h-full overflow-y-auto py-8 px-4 flex flex-col gap-1">
            {NAV.map((section) => (
                <div key={section.label} className="mb-4">
                    <div className="flex items-center gap-2 px-2 mb-2">
                        <span style={{ color: "rgba(63,63,70,1)" }}><section.icon className="h-3 w-3" /></span>
                        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(63,63,70,1)" }}>
                            {section.label}
                        </span>
                    </div>
                    {section.items.map((item) => {
                        const active = activeSection === item.id;
                        return (
                            <button
                                key={item.id}
                                className="w-full text-left px-3 py-1.5 rounded-lg text-[13px] transition-all mb-0.5"
                                style={{
                                    background: active ? "rgba(255,255,255,0.07)" : "transparent",
                                    color: active ? "#fff" : "rgba(113,113,122,1)",
                                    fontWeight: active ? 500 : 400,
                                    borderLeft: active ? "2px solid rgba(255,255,255,0.3)" : "2px solid transparent",
                                }}
                                onClick={() => { setActiveSection(item.id); setMobileOpen(false); }}
                            >
                                {item.label}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );

    return (
        <>
            {/* Mobile toggle */}
            <button
                className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full flex items-center justify-center shadow-2xl lg:hidden"
                style={{ background: "#fff", color: "#000" }}
                onClick={() => setMobileOpen(!mobileOpen)}
            >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {/* Desktop sidebar */}
            <aside
                className="hidden lg:block sticky top-20 h-[calc(100vh-5rem)] shrink-0"
                style={{ borderRight: "1px solid rgba(255,255,255,0.05)", width: "256px" }}
            >
                {inner}
            </aside>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 z-40 lg:hidden"
                    onClick={() => setMobileOpen(false)}
                >
                    <div
                        className="absolute left-0 top-0 bottom-0 w-64 overflow-y-auto"
                        style={{ background: "#111111", borderRight: "1px solid rgba(255,255,255,0.08)" }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="pt-20">{inner}</div>
                    </div>
                </div>
            )}
        </>
    );
}
