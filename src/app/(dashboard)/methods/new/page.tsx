"use client";

import { useState } from "react";
import { Button, Tag, Input } from "@lobehub/ui";
import {
    ArrowLeft,
    Smartphone,
    CreditCard,
    Globe,
    Zap,
    ChevronRight,
    CheckCircle2,
    Search
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Drapeau } from "@/components/ui/drapeau";

const countries = [
    { name: "Sénégal", code: "SN" },
    { name: "Côte d'Ivoire", code: "CI" },
    { name: "Mali", code: "ML" },
    { name: "Bénin", code: "BJ" },
    { name: "Togo", code: "TG" },
    { name: "Guinée", code: "GN" },
    { name: "Burkina Faso", code: "BF" },
    { name: "Congo", code: "CG" },
];

const operators = [
    { name: "Orange Money", icon: Smartphone, type: "Mobile Money" },
    { name: "MTN MoMo", icon: Smartphone, type: "Mobile Money" },
    { name: "Moov Money", icon: Smartphone, type: "Mobile Money" },
    { name: "Wave", icon: Smartphone, type: "Mobile Money" },
    { name: "Visa / MasterCard", icon: CreditCard, type: "Card" },
];

const gateways = [
    { name: "PayDunya", region: "UEMOA", status: "Active" },
    { name: "FedaPay", region: "UEMOA", status: "Active" },
    { name: "PawaPay", region: "Multizone", status: "Active" },
    { name: "CinetPay", region: "UEMOA", status: "Active" },
];

export default function NewMethodPage() {
    const [step, setStep] = useState(1);
    const [selection, setSelection] = useState({
        country: null as any,
        operator: null as any,
        gateway: null as any
    });

    const nextStep = () => setStep(prev => prev + 1);
    const prevStep = () => setStep(prev => prev - 1);

    return (
        <div className="flex flex-col gap-8 max-w-4xl mx-auto py-8">
            <div className="flex items-center gap-4">
                <Link href="/methods">
                    <button className="rounded-full h-10 w-10 bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                </Link>
                <div>
                    <h1 className="text-3xl font-black italic tracking-tighter uppercase text-gradient">
                        Ajouter un <span className="text-primary italic">Canal</span>
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--dt-text-muted)' }}>Déployez un nouveau moyen de paiement régional.</p>
                </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-4 px-2">
                {[1, 2, 3, 4].map((s) => (
                    <div key={s} className="flex items-center gap-2 flex-1">
                        <div className={`h-2 rounded-full flex-1 transition-all duration-500 ${step >= s ? 'bg-primary' : 'bg-white/10'}`} />
                    </div>
                ))}
            </div>

            <AnimatePresence mode="wait">
                {step === 1 && (
                    <motion.div
                        key="step1"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold">Sélectionnez le pays de destination</h2>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--dt-text-muted)' }} />
                                <Input placeholder="Filtrer..." style={{ paddingLeft: 36, height: 40, width: 192, borderRadius: 12 }} />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {countries.map((c) => (
                                <button
                                    key={c.code}
                                    onClick={() => {
                                        setSelection({ ...selection, country: c });
                                        nextStep();
                                    }}
                                    className="p-6 rounded-3xl border border-white/10 bg-card/40 hover:border-primary/50 hover:bg-primary/5 transition-all group text-center"
                                >
                                    <span className="mb-4 block transition-transform group-hover:scale-110"><Drapeau code={c.code} taille={44} nom={c.name} /></span>
                                    <span className="font-bold tracking-tight">{c.name}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}

                {step === 2 && (
                    <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <h2 className="text-xl font-bold">Choisissez l'opérateur ou type de canal</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {operators.map((op) => (
                                <button
                                    key={op.name}
                                    onClick={() => {
                                        setSelection({ ...selection, operator: op });
                                        nextStep();
                                    }}
                                    className="p-6 rounded-[2rem] border border-white/10 bg-card/40 hover:border-primary/50 hover:bg-primary/5 transition-all text-left flex items-center gap-6 group"
                                >
                                    <div className="h-14 w-14 rounded-2xl bg-white/5 flex items-center justify-center group-hover:bg-primary opacity-60 group-hover:opacity-100 transition-all shadow-inner">
                                        <op.icon className="h-7 w-7" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold">{op.name}</h3>
                                        <p className="text-xs uppercase font-black tracking-widest" style={{ color: 'var(--dt-text-muted)' }}>{op.type}</p>
                                    </div>
                                    <ChevronRight className="ml-auto h-5 w-5 group-hover:text-primary transition-colors" style={{ color: 'var(--dt-text-muted)' }} />
                                </button>
                            ))}
                        </div>
                        <Button onClick={prevStep} style={{ marginTop: 16 }}>Retour</Button>
                    </motion.div>
                )}

                {step === 3 && (
                    <motion.div
                        key="step3"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >
                        <div className="space-y-2">
                            <h2 className="text-xl font-bold">Lier à une passerelle de routage</h2>
                            <p className="text-sm" style={{ color: 'var(--dt-text-muted)' }}>Sélectionnez l'API qui traitera ces transactions.</p>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                            {gateways.map((gw) => (
                                <button
                                    key={gw.name}
                                    onClick={() => {
                                        setSelection({ ...selection, gateway: gw });
                                        nextStep();
                                    }}
                                    className="p-6 rounded-3xl border border-white/10 bg-card/40 hover:border-teal-500/50 hover:bg-teal-500/5 transition-all text-left flex items-center justify-between group"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center font-black text-primary">
                                            {gw.name.substring(0, 2)}
                                        </div>
                                        <div>
                                            <h3 className="font-bold">{gw.name}</h3>
                                            <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Région: {gw.region}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Tag color="green">Active</Tag>
                                        <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Zap className="h-4 w-4 text-teal-500" />
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                        <Button onClick={prevStep} style={{ marginTop: 16 }}>Retour</Button>
                    </motion.div>
                )}

                {step === 4 && (
                    <motion.div
                        key="step4"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center text-center py-12"
                    >
                        <div className="w-full max-w-sm mb-12 p-8 rounded-3xl bg-white/5 border border-white/10 relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <Globe className="h-24 w-24" />
                            </div>
                            <div className="flex items-center justify-between mb-8">
                                <Drapeau code={selection.country?.code || ""} taille={44} nom={selection.country?.name} />
                                <div className="h-10 w-10 rounded-full bg-teal-500/20 flex items-center justify-center">
                                    <CheckCircle2 className="h-6 w-6 text-teal-500" />
                                </div>
                            </div>
                            <div className="space-y-4 text-left">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--dt-text-muted)' }}>Canal</p>
                                    <p className="text-xl font-bold text-white">{selection.operator?.name} {selection.country?.name}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--dt-text-muted)' }}>Passerelle</p>
                                    <p className="text-lg font-medium text-primary">{selection.gateway?.name}</p>
                                </div>
                            </div>
                        </div>

                        <h2 className="text-3xl font-black italic tracking-tighter uppercase mb-2">Canal <span className="text-teal-500 italic">Harmonisé</span></h2>
                        <p className="mb-8 max-w-xs" style={{ color: 'var(--dt-text-muted)' }}>
                            Le nouveau canal a été injecté dans l'orchestrateur et est prêt à recevoir du trafic.
                        </p>

                        <div className="flex flex-col gap-3 w-full max-w-xs">
                            <Link href="/methods">
                                <Button type="primary" block style={{ height: 56, borderRadius: 16, fontWeight: 700, fontSize: 18 }}>
                                    Terminer la configuration
                                </Button>
                            </Link>
                            <Button block style={{ height: 48, borderRadius: 12 }}>Configuration Avancée</Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
