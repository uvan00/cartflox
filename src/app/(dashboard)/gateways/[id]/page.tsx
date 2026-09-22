"use client";

import { use, useEffect, useState } from "react";
import { Button, Tag, Input } from "@lobehub/ui";
import {
    ArrowLeft,
    Settings2,
    Zap,
    ShieldCheck,
    Smartphone,
    Wifi,
    Activity,
    Lock,
    Webhook,
    Terminal,
    AlertTriangle,
    CheckCircle2,
    Loader2,
    Save,
    Trash2,
    AlertCircle,
    Eye,
    EyeOff,
    Copy,
    Check
} from "lucide-react";
import Link from "next/link";
import { getGatewayById, updateGateway, deleteGateway, validateGatewayCredentials } from "@/lib/actions/gateways";
import { useRouter } from "next/navigation";

export default function GatewayDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [gateway, setGateway] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Configuration state management
    const [mode, setMode] = useState<'test' | 'live'>('test');

    // Test Config
    const [testKeys, setTestKeys] = useState({
        masterKey: "",
        privateKey: "",
        token: ""
    });

    // Live Config
    const [liveKeys, setLiveKeys] = useState({
        masterKey: "",
        privateKey: "",
        token: ""
    });

    // Visibility state
    const [showMaster, setShowMaster] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [showPrivate, setShowPrivate] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    useEffect(() => {
        const fetchGateway = async () => {
            const data = await getGatewayById(id);
            if (data) {
                setGateway(data);

                // Initialize configs
                const config = data.config || {};
                const currentMode = config.mode || 'test';
                setMode(currentMode);

                // Handle legacy or structured config
                if (config.test || config.live) {
                    setTestKeys({
                        masterKey: config.test?.masterKey || "",
                        privateKey: config.test?.privateKey || "",
                        token: config.test?.token || ""
                    });
                    setLiveKeys({
                        masterKey: config.live?.masterKey || "",
                        privateKey: config.live?.privateKey || "",
                        token: config.live?.token || ""
                    });
                } else {
                    // Legacy migration: put existing keys in the active mode
                    const legacyKeys = {
                        masterKey: config.masterKey || "",
                        privateKey: config.privateKey || "",
                        token: config.token || ""
                    };

                    if (currentMode === 'test') {
                        setTestKeys(legacyKeys);
                    } else {
                        setLiveKeys(legacyKeys);
                    }
                }
            }
            setIsLoading(false);
        };
        fetchGateway();
    }, [id]);

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    };

    // Current keys based on mode
    const currentKeys = mode === 'test' ? testKeys : liveKeys;
    const setCurrentKeys = mode === 'test' ? setTestKeys : setLiveKeys;

    const handleKeyChange = (field: string, value: string) => {
        setCurrentKeys(prev => ({ ...prev, [field]: value }));
    };

    const handleUpdate = async () => {
        setIsSaving(true);
        setError("");
        setSuccess("");

        try {
            const newConfig = {
                mode,
                test: testKeys,
                live: liveKeys,
                // Keep flat keys for compatibility with existing orchestrator logic
                masterKey: mode === 'test' ? testKeys.masterKey : liveKeys.masterKey,
                privateKey: mode === 'test' ? testKeys.privateKey : liveKeys.privateKey,
                token: mode === 'test' ? testKeys.token : liveKeys.token,
            };

            // Validate ONLY the currently selected environment keys
            const validation = await validateGatewayCredentials(gateway.name.toLowerCase(), {
                masterKey: currentKeys.masterKey,
                privateKey: currentKeys.privateKey,
                token: currentKeys.token,
                mode: mode
            });

            if (!validation.success) {
                setError(`Validation ${mode === 'test' ? 'Sandbox' : 'Live'} échouée : ${validation.message}`);
                setIsSaving(false);
                return;
            }

            const result = await updateGateway(id, {
                config: newConfig,
            });

            if (result.success) {
                setSuccess(`Configuration ${mode === 'test' ? 'Sandbox' : 'Production'} enregistrée.`);
                setGateway(result.gateway);
            } else {
                setError("Erreur lors de l'enregistrement.");
            }
        } catch (err: any) {
            setError(err.message || "Une erreur est survenue.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleStatus = async () => {
        setIsSaving(true);
        const newStatus = gateway.status === 'active' ? 'maintenance' : 'active';
        const result = await updateGateway(id, { status: newStatus });
        if (result.success) {
            setGateway(result.gateway);
        }
        setIsSaving(false);
    };

    const handleDelete = async () => {
        if (!confirm("⚠️ Cette action supprimera définitivement l'intégration. Souhaitez-vous continuer ?")) return;

        setIsDeleting(true);
        const result = await deleteGateway(id);
        if (result.success) {
            router.push("/gateways");
        } else {
            setError("Erreur lors de la suppression.");
            setIsDeleting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <div className="relative">
                    <div className="h-16 w-16 rounded-full border-t-2 border-primary animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-pulse text-primary" />
                    </div>
                </div>
            </div>
        );
    }

    if (!gateway) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
                <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-6 w-6 text-amber-400" />
                </div>
                <div className="space-y-1">
                    <h1 className="text-lg font-semibold">Intégration introuvable</h1>
                    <p className="text-sm max-w-xs" style={{ color: 'var(--dt-text-muted)' }}>Cette passerelle n'existe plus ou vous n'avez pas les droits d'accès.</p>
                </div>
                <Link href="/gateways">
                    <Button style={{ borderRadius: 8, height: 36 }}>
                        Retour
                    </Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 pb-12 max-w-7xl mx-auto p-4 md:p-8">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <Link href="/gateways">
                        <button className="h-8 w-8 rounded-lg transition-colors flex items-center justify-center" style={{ border: '1px solid var(--dt-border)', background: 'var(--dt-card-bg)' }}>
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg flex items-center justify-center text-primary overflow-hidden p-1.5" style={{ background: 'var(--dt-item-hover)' }}>
                            {gateway.logo ? <img src={gateway.logo} alt="" className="w-full h-full object-contain" /> : gateway.name.substring(0, 2)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-semibold">{gateway.name}</h1>
                                <Tag color={gateway.status === 'active' ? 'green' : 'red'} style={{ fontSize: 11 }}>
                                    {gateway.status === 'active' ? 'En Ligne' : 'Maintenance'}
                                </Tag>
                            </div>
                            <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--dt-text-muted)' }}>
                                ID: <code className="font-mono" style={{ color: 'var(--dt-text-muted)' }}>{gateway.id}</code>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    <Button style={{ borderRadius: 8, height: 36, fontSize: 13 }}>
                        <Terminal className="h-3.5 w-3.5 mr-1.5" /> Logs
                    </Button>
                    <Button
                        onClick={handleToggleStatus}
                        danger={gateway.status === 'active'}
                        style={{ borderRadius: 8, height: 36, fontSize: 13 }}
                    >
                        {gateway.status === 'active' ? 'Suspendre' : 'Rétablir'}
                    </Button>
                    <div className="flex-1" />
                    <div className="flex gap-2">
                        <button
                            onClick={handleDelete}
                            className="h-8 w-8 rounded-lg hover:text-red-400 hover:bg-red-500/5 transition-colors flex items-center justify-center"
                            style={{ color: 'var(--dt-text-muted)' }}
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={15} />}
                        </button>
                        <Button
                            type="primary"
                            onClick={handleUpdate}
                            disabled={isSaving}
                            icon={isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            style={{ borderRadius: 8, height: 36, fontSize: 13 }}
                        >
                            Sauvegarder
                        </Button>
                    </div>
                </div>
            </div>

            {(error || success) && (
                <div className={`p-3 rounded-lg border flex gap-3 items-center ${error ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-teal-500/10 border-teal-500/20 text-teal-400'}`}>
                    {error ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
                    <p className="text-xs flex-1">{error || success}</p>
                    <button onClick={() => { setError(""); setSuccess(""); }} className="opacity-50 hover:opacity-100 transition-opacity">
                        <Trash2 size={12} />
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Configuration API */}
                <div className="lg:col-span-2 rounded-xl overflow-hidden" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                    <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--dt-border)' }}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-medium">Gestion des Clés</h3>
                                <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Environnements isolés</p>
                            </div>
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center overflow-hidden p-1.5" style={{ background: 'var(--dt-item-hover)' }}>
                                {gateway.logo ? <img src={gateway.logo} alt="" className="w-full h-full object-contain" /> : <Lock className="h-4 w-4" style={{ color: 'var(--dt-text-muted)' }} />}
                            </div>
                        </div>
                    </div>
                    <div className="p-5 space-y-6">
                        <div className="space-y-3">
                            <label className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Environnement</label>
                            <div className="flex gap-1.5 p-1 rounded-lg w-fit" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                                <button
                                    onClick={() => setMode('test')}
                                    className={`px-4 py-1.5 rounded-md text-xs transition-colors ${mode === 'test' ? 'bg-amber-500 text-black' : ''}`}
                                    style={mode !== 'test' ? { color: 'var(--dt-text-muted)' } : {}}
                                >
                                    Sandbox
                                </button>
                                <button
                                    onClick={() => setMode('live')}
                                    className={`px-4 py-1.5 rounded-md text-xs transition-colors ${mode === 'live' ? 'bg-teal-500 text-black' : ''}`}
                                    style={mode !== 'live' ? { color: 'var(--dt-text-muted)' } : {}}
                                >
                                    Production
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Master Key */}
                            <div className="space-y-2">
                                <label htmlFor="masterKey" className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Master API Key</label>
                                <div className="relative">
                                    <Input
                                        id="masterKey"
                                        placeholder={mode === 'test' ? "Master Key de test..." : "Master Key de production..."}
                                        className={`h-10 rounded-lg px-3 text-xs font-mono transition-all pr-20 border ${!showMaster && 'text-security'}`}
                                        style={{ background: 'var(--dt-input-bg)', borderColor: 'var(--dt-input-border)' }}
                                        value={currentKeys.masterKey}
                                        onChange={(e) => handleKeyChange('masterKey', e.target.value)}
                                        autoComplete="off"
                                    />
                                    <div className="absolute right-3 top-2 flex gap-1.5">
                                        <button className="h-8 w-8 rounded-xl hover:bg-white/10 transition-all active:scale-90 flex items-center justify-center" onClick={() => setShowMaster(!showMaster)}>
                                            {showMaster ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                        <button className="h-8 w-8 rounded-xl hover:bg-white/10 transition-all active:scale-90 flex items-center justify-center" onClick={() => handleCopy(currentKeys.masterKey, 'master')}>
                                            {copied === 'master' ? <Check size={14} className="text-teal-500" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Token Boutique */}
                            <div className="space-y-2">
                                <label htmlFor="token" className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Shop Token</label>
                                <div className="relative">
                                    <Input
                                        id="token"
                                        placeholder="Token boutique..."
                                        className={`h-10 rounded-lg px-3 text-xs font-mono transition-all pr-20 border ${!showToken && 'text-security'}`}
                                        style={{ background: 'var(--dt-input-bg)', borderColor: 'var(--dt-input-border)' }}
                                        value={currentKeys.token}
                                        onChange={(e) => handleKeyChange('token', e.target.value)}
                                        autoComplete="off"
                                    />
                                    <div className="absolute right-3 top-2 flex gap-1.5">
                                        <button className="h-8 w-8 rounded-xl hover:bg-white/10 transition-all active:scale-90 flex items-center justify-center" onClick={() => setShowToken(!showToken)}>
                                            {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                        <button className="h-8 w-8 rounded-xl hover:bg-white/10 transition-all active:scale-90 flex items-center justify-center" onClick={() => handleCopy(currentKeys.token, 'token')}>
                                            {copied === 'token' ? <Check size={14} className="text-teal-500" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Private Key */}
                            <div className="space-y-2 md:col-span-2">
                                <label htmlFor="privateKey" className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Private Secret Key</label>
                                <div className="relative">
                                    <Input
                                        id="privateKey"
                                        type={showPrivate ? "text" : "password"}
                                        placeholder="sk_test_..."
                                        className="h-10 rounded-lg px-3 text-xs font-mono transition-all pr-20 border"
                                        style={{ background: 'var(--dt-input-bg)', borderColor: 'var(--dt-input-border)' }}
                                        value={currentKeys.privateKey}
                                        onChange={(e) => handleKeyChange('privateKey', e.target.value)}
                                        autoComplete="new-password"
                                    />
                                    <div className="absolute right-3 top-2 flex gap-1.5">
                                        <button className="h-8 w-8 rounded-xl hover:bg-white/10 transition-all active:scale-90 flex items-center justify-center" onClick={() => setShowPrivate(!showPrivate)}>
                                            {showPrivate ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                        <button className="h-8 w-8 rounded-xl hover:bg-white/10 transition-all active:scale-90 flex items-center justify-center" onClick={() => handleCopy(currentKeys.privateKey, 'private')}>
                                            {copied === 'private' ? <Check size={14} className="text-teal-500" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/10 flex gap-3 items-center">
                            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                            <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>
                                Chiffrement <span className="text-primary font-medium">AES-256-GCM</span>. Aucune version en clair conservée.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 h-full">
                    {/* Webhooks Card */}
                    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--dt-border)' }}>
                            <h3 className="text-sm font-medium flex items-center gap-2">
                                <Webhook className="h-4 w-4" style={{ color: 'var(--dt-text-muted)' }} /> Webhooks
                            </h3>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Endpoint</label>
                                <div className="relative">
                                    <div className="w-full rounded-lg p-3 font-mono text-[11px]" style={{ background: 'var(--dt-input-bg)', border: '1px solid var(--dt-border)' }}>
                                        https://api.afriflow.com/v1/webhooks/{gateway.name.toLowerCase()}
                                    </div>
                                    <button
                                        className="absolute right-1.5 top-1.5 h-7 px-3 rounded-md text-xs transition-colors flex items-center gap-1"
                                        style={{ background: 'var(--dt-item-hover)' }}
                                        onClick={() => handleCopy(`https://api.afriflow.com/v1/webhooks/${gateway.name.toLowerCase()}`, 'webhook')}
                                    >
                                        {copied === 'webhook' ? <Check size={12} /> : <Copy size={12} />}
                                        {copied === 'webhook' ? 'Copié' : 'Copier'}
                                    </button>
                                </div>
                            </div>
                            <div className="p-3 rounded-lg bg-teal-500/5 border border-teal-500/10">
                                <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>
                                    Configurez cette URL dans <span className="font-medium">{gateway.name}</span> pour recevoir les statuts en temps réel.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="rounded-xl p-5" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Disponibilité</p>
                            <Tag color="green" style={{ fontSize: 10 }}>Stable</Tag>
                        </div>
                        <p className="text-3xl font-semibold mb-1">{gateway.uptime}</p>
                        <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Uptime global</p>
                        <div className="h-1.5 w-full rounded-full overflow-hidden mt-3" style={{ background: 'var(--dt-item-hover)' }}>
                            <div style={{ width: gateway.uptime }} className="h-full bg-primary rounded-full transition-all" />
                        </div>
                    </div>
                </div>

                {/* Performance Analytics */}
                <div className="lg:col-span-3 rounded-xl p-6" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                        <div className="space-y-2">
                            <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Taux de Conversion</p>
                            <p className="text-3xl font-semibold">{gateway.successRate}</p>
                            <p className="text-xs text-teal-400">Performance optimale</p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Latence API</p>
                            <p className="text-3xl font-semibold">1.2s</p>
                            <Tag style={{ fontSize: 10 }}>-0.2s vs hier</Tag>
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Status Réseau</p>
                            <p className="text-lg font-medium text-teal-400">Opérationnel</p>
                            <p className="text-xs" style={{ color: 'var(--dt-text-muted)' }}>Vérifié il y a 2 min</p>
                        </div>
                    </div>
                </div>

                {/* Capabilities Grid */}
                <div className="lg:col-span-3 rounded-xl p-6" style={{ background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' }}>
                    <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                        <div>
                            <h2 className="text-base font-medium">Capacités du Canal</h2>
                            <p className="text-xs max-w-md" style={{ color: 'var(--dt-text-muted)' }}>Capacités activées sur votre intégration {gateway.name}.</p>
                        </div>
                        <Tag color="blue" style={{ fontSize: 10 }}>Hub Africain</Tag>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { icon: Smartphone, label: "Mobile Money", desc: "Opérateurs locaux (Orange, MTN, Moov, Wave)", active: true },
                            { icon: Zap, label: "Flash Confirmation", desc: "Traitement asynchrone ultra-rapide", active: true },
                            { icon: ShieldCheck, label: "3DS 2.x", desc: "Authentification forte", active: gateway.status === 'active' },
                            { icon: Lock, label: "Tokenization", desc: "Stockage sécurisé des cartes", active: false },
                        ].map((feat, i) => (
                            <div
                                key={i}
                                className="p-5 rounded-xl transition-colors"
                                style={feat.active ? { background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)' } : { background: 'var(--dt-card-bg)', border: '1px solid var(--dt-border)', opacity: 0.4 }}
                            >
                                <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${feat.active ? 'bg-primary/10' : ''}`}
                                    style={!feat.active ? { background: 'var(--dt-item-hover)' } : {}}>
                                    <feat.icon className={`h-4 w-4 ${feat.active ? 'text-primary' : ''}`}
                                        style={!feat.active ? { color: 'var(--dt-text-muted)' } : {}} />
                                </div>
                                <h4 className="text-sm font-medium mb-1">{feat.label}</h4>
                                <p className="text-xs mb-3" style={{ color: 'var(--dt-text-muted)' }}>{feat.desc}</p>
                                <span className={`text-xs ${feat.active ? 'text-primary' : ''}`}
                                    style={!feat.active ? { color: 'var(--dt-text-muted)' } : {}}>{feat.active ? 'Actif' : 'Bloqué'}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
