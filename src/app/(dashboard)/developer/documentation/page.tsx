"use client";

import { Button, Tag } from "@lobehub/ui";
import {
    ChevronLeft,
    Webhook,
    ArrowRight,
    Zap,
    Cpu,
    Globe,
    Lock,
    MessageSquare,
    GitBranch,
    Activity,
    PlayCircle,
} from "lucide-react";
import Link from "next/link";

export default function DocumentationPage() {
    const mainCategories = [
        {
            title: "Authentification API",
            desc: "Sécurisez vos requêtes avec l'authentification Bearer Token et vos clés secrètes d'orchestrateur.",
            icon: Lock,
            color: "text-teal-500",
            bg: "bg-teal-500/10",
            link: "/docs?section=authentication"
        },
        {
            title: "Paiements & Checkout",
            desc: "Créez des intentions de paiement et gérez les flux de redirection multi-passerelles.",
            icon: Zap,
            color: "text-blue-500",
            bg: "bg-blue-500/10",
            link: "/docs?section=payments-create"
        },
        {
            title: "Smart Routing",
            desc: "5 algorithmes (Priority, Volume Split, Règles DSL, Dynamic) + fallback automatique pour orchestrer plusieurs passerelles.",
            icon: GitBranch,
            color: "text-indigo-500",
            bg: "bg-indigo-500/10",
            link: "/docs?section=smart-routing"
        },
        {
            title: "Webhooks & Events",
            desc: "Recevez des notifications en temps réel lors du succès ou de l'échec des transactions.",
            icon: Webhook,
            color: "text-amber-500",
            bg: "bg-amber-500/10",
            link: "/docs?section=webhooks-setup"
        },
        {
            title: "SDKs & Librairies",
            desc: "Utilisez nos SDKs officiels pour Node.js, Python, PHP, Ruby et Go.",
            icon: Cpu,
            color: "text-purple-500",
            bg: "bg-purple-500/10",
            link: "/docs?section=sdks-node"
        },
        {
            title: "Audit log des décisions",
            desc: "Traçabilité de chaque décision de routage : algo, ordre des passerelles tentées, issue.",
            icon: Activity,
            color: "text-rose-500",
            bg: "bg-rose-500/10",
            link: "/methods?tab=decisions"
        },
    ];

    return (
        <div className="flex flex-col gap-8 pb-12 max-w-7xl mx-auto p-4 md:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5" style={{ borderBottom: '1px solid var(--dt-border)' }}>
                <div className="flex items-center gap-3">
                    <Link href="/developer">
                        <button className="h-8 w-8 rounded-lg transition-colors flex items-center justify-center" style={{ border: '1px solid var(--dt-border)', background: 'var(--dt-card-bg)' }}>
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2 mb-0.5">
                            <Tag color="green" style={{ fontSize: 10 }}>v1.2</Tag>
                        </div>
                        <h1 className="text-lg font-semibold">Documentation API</h1>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button style={{ borderRadius: 8, height: 36, fontSize: 13 }}>
                        OpenAPI Spec
                    </Button>
                    <Button type="primary" style={{ borderRadius: 8, height: 36, fontSize: 13 }}>
                        Postman Collection
                    </Button>
                </div>
            </div>

            {/* Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
                <div className="lg:col-span-1 space-y-4">
                    <div className="rounded-xl p-5" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                        <h2 className="text-base font-medium mb-2">Démarrage rapide</h2>
                        <p className="text-xs mb-4" style={{ color: 'var(--dt-text-muted)' }}>
                            Intégration en moins de 10 minutes. Suivez nos guides thématiques.
                        </p>
                        <div className="space-y-2">
                            {[
                                { label: "Installation du SDK", href: "/docs?section=quickstart" },
                                { label: "Première transaction", href: "/docs?section=payments-create" },
                                { label: "Configurer le Smart Routing", href: "/docs?section=smart-routing" },
                                { label: "Tester avec le simulateur", href: "/methods?tab=routing", icon: PlayCircle },
                                { label: "Vérification des signatures", href: "/docs?section=webhooks-security" },
                            ].map((step, i) => {
                                const Icon = step.icon;
                                return (
                                    <Link key={i} href={step.href} className="flex items-center gap-2.5 text-sm hover:text-primary transition-colors">
                                        <div className="h-5 w-5 rounded-md flex items-center justify-center text-[10px]" style={{ background: 'var(--dt-item-hover)', color: 'var(--dt-text-muted)' }}>
                                            {Icon ? <Icon className="h-3 w-3" /> : i + 1}
                                        </div>
                                        <span>{step.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-xl p-5" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                        <div className="flex items-start gap-3">
                            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                                <MessageSquare className="h-4 w-4 text-indigo-400" />
                            </div>
                            <div>
                                <p className="text-sm font-medium">Communauté Slack</p>
                                <p className="text-xs mt-0.5" style={{ color: 'var(--dt-text-muted)' }}>1,200+ développeurs sur notre canal officiel.</p>
                                <button className="p-0 h-auto text-indigo-400 text-xs mt-1.5 bg-transparent border-none cursor-pointer hover:underline">Rejoindre</button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {mainCategories.map((cat, i) => (
                        <Link key={i} href={cat.link} className="block">
                            <div className="rounded-xl transition-colors cursor-pointer group h-full flex flex-col hover:border-primary/40" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                                <div className="p-5 flex-1 flex flex-col">
                                    <div className={`h-9 w-9 rounded-lg ${cat.bg} flex items-center justify-center mb-3`}>
                                        <cat.icon className={`h-4 w-4 ${cat.color}`} />
                                    </div>
                                    <h3 className="text-sm font-medium mb-1">{cat.title}</h3>
                                    <p className="text-xs leading-relaxed mb-4 flex-1" style={{ color: 'var(--dt-text-muted)' }}>{cat.desc}</p>
                                    <div className="flex items-center gap-1 text-xs text-primary">
                                        Explorer <ArrowRight className="h-3 w-3" />
                                    </div>
                                </div>
                            </div>
                        </Link>
                    ))}

                    <div className="sm:col-span-2 rounded-xl p-5 mt-1" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-teal-500/10 flex items-center justify-center">
                                    <Globe className="h-4 w-4 text-teal-400" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-medium">Endpoints Régionaux</h4>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--dt-text-muted)' }}>
                                        Connectez-vous au serveur le plus proche (CI, SN, ML, CM).
                                    </p>
                                </div>
                            </div>
                            <Button style={{ borderRadius: 8, height: 36, fontSize: 13 }}>
                                Carte de latence
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Support CTA */}
            <div className="rounded-xl p-6 mt-2" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                <div className="flex flex-col lg:flex-row items-center justify-between gap-5">
                    <div className="text-center lg:text-left">
                        <Tag color="blue" style={{ fontSize: 10, marginBottom: 8 }}>Support</Tag>
                        <h2 className="text-base font-medium mb-1">Besoin d'accompagnement technique ?</h2>
                        <p className="text-sm max-w-lg" style={{ color: 'var(--dt-text-muted)' }}>
                            Nos ingénieurs sont prêts à vous aider pour l'architecture de paiement ou le debug.
                        </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                        <Button type="primary" icon={<MessageSquare className="h-3.5 w-3.5" />} style={{ borderRadius: 8, height: 36, fontSize: 13 }}>
                            Chat Live
                        </Button>
                        <Button style={{ borderRadius: 8, height: 36, fontSize: 13 }}>
                            Planifier un Call
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
