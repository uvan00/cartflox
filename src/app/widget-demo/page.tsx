"use client";

import { useState } from "react";
import Script from "next/script";

export default function WidgetDemoPage() {
    const [apiKey, setApiKey] = useState("");
    const [amount, setAmount] = useState("5000");
    const [currency, setCurrency] = useState("XOF");
    const [customerName, setCustomerName] = useState("Client Test");
    const [customerEmail, setCustomerEmail] = useState("test@example.com");
    const [customerPhone, setCustomerPhone] = useState("+2250700000000");
    const [description, setDescription] = useState("Test de paiement widget");
    const [log, setLog] = useState<string[]>([]);

    const addLog = (msg: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    const handleCheckout = () => {
        if (!apiKey) {
            addLog("❌ Entrez votre clé API d'abord !");
            return;
        }

        addLog("🔧 Cartflox.configure() appelé");
        (window as any).Cartflox?.configure({ publicKey: apiKey });

        addLog("🚀 Cartflox.checkout() lancé...");
        (window as any).Cartflox?.checkout({
            amount: Number(amount),
            currency,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone,
            description,
            onSuccess: (data: any) => {
                addLog(`✅ Paiement réussi ! ${JSON.stringify(data)}`);
            },
            onClose: () => {
                addLog("🔒 Checkout fermé");
            },
            onError: (err: any) => {
                addLog(`❌ Erreur: ${err}`);
            }
        });
    };

    return (
        <>
            <Script src="/afriflow.js" strategy="afterInteractive" onLoad={() => addLog("📦 afriflow.js chargé")} />

            <div style={{ minHeight: '100vh', background: '#0F172A', color: '#E2E8F0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>

                    {/* Header */}
                    <div style={{ marginBottom: 40 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #10B981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>⚡</div>
                            <div>
                                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Cartflox Widget Demo</h1>
                                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Testez l&apos;intégration du widget de paiement embarquable</p>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

                        {/* Left: Config */}
                        <div style={{ background: '#1E293B', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>
                            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: '#F1F5F9' }}>Configuration</h2>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 6 }}>Clé API (secretKey)</label>
                                    <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="af_live_pub_VOTRE_CLE"
                                        style={{ width: '100%', height: 40, borderRadius: 8, padding: '0 12px', background: '#0F172A', border: '1px solid #334155', color: '#F1F5F9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                                    <p style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Trouvez-la dans Dashboard → Paramètres → API</p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 6 }}>Montant</label>
                                        <input value={amount} onChange={e => setAmount(e.target.value)} type="number"
                                            style={{ width: '100%', height: 40, borderRadius: 8, padding: '0 12px', background: '#0F172A', border: '1px solid #334155', color: '#F1F5F9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 6 }}>Devise</label>
                                        <select value={currency} onChange={e => setCurrency(e.target.value)}
                                            style={{ width: '100%', height: 40, borderRadius: 8, padding: '0 12px', background: '#0F172A', border: '1px solid #334155', color: '#F1F5F9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
                                            <option>XOF</option><option>XAF</option><option>GNF</option><option>USD</option><option>EUR</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 6 }}>Nom du client</label>
                                    <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                                        style={{ width: '100%', height: 40, borderRadius: 8, padding: '0 12px', background: '#0F172A', border: '1px solid #334155', color: '#F1F5F9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                                </div>

                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 6 }}>Email</label>
                                    <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                                        style={{ width: '100%', height: 40, borderRadius: 8, padding: '0 12px', background: '#0F172A', border: '1px solid #334155', color: '#F1F5F9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                                </div>

                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 6 }}>Téléphone</label>
                                    <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                                        style={{ width: '100%', height: 40, borderRadius: 8, padding: '0 12px', background: '#0F172A', border: '1px solid #334155', color: '#F1F5F9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                                </div>

                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', display: 'block', marginBottom: 6 }}>Description</label>
                                    <input value={description} onChange={e => setDescription(e.target.value)}
                                        style={{ width: '100%', height: 40, borderRadius: 8, padding: '0 12px', background: '#0F172A', border: '1px solid #334155', color: '#F1F5F9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                                </div>

                                <button onClick={handleCheckout}
                                    style={{ width: '100%', height: 48, borderRadius: 10, background: '#10B981', color: 'white', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginTop: 8, boxShadow: '0 4px 14px rgba(16,185,129,0.3)' }}>
                                    ⚡ Ouvrir le Checkout
                                </button>
                            </div>
                        </div>

                        {/* Right: Code + Logs */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                            {/* Code snippet */}
                            <div style={{ background: '#1E293B', borderRadius: 16, padding: 24, border: '1px solid #334155' }}>
                                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#F1F5F9' }}>Code d&apos;intégration</h2>
                                <pre style={{ background: '#0F172A', borderRadius: 10, padding: 16, fontSize: 12, lineHeight: 1.6, color: '#94A3B8', overflow: 'auto', border: '1px solid #1E293B', margin: 0 }}>
{`<!-- 1. Ajouter le script -->
<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/afriflow.js"><\/script>

<!-- 2. Configurer + Lancer -->
<script>
  Cartflox.configure({
    publicKey: '${apiKey || 'VOTRE_CLE_API'}'
  });

  // Programmatique
  Cartflox.checkout({
    amount: ${amount},
    currency: '${currency}',
    customer_name: '${customerName}',
    description: '${description}',
    onSuccess: function(data) {
      alert('Payé ! ' + data.orderId);
    }
  });
<\/script>

<!-- OU: Auto-binding avec attributs -->
<button
  data-afriflow-amount="${amount}"
  data-afriflow-currency="${currency}">
  Payer ${amount} ${currency}
</button>`}
                                </pre>
                            </div>

                            {/* Event Logs */}
                            <div style={{ background: '#1E293B', borderRadius: 16, padding: 24, border: '1px solid #334155', flex: 1, minHeight: 200 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <h2 style={{ fontSize: 16, fontWeight: 600, color: '#F1F5F9', margin: 0 }}>Event Log</h2>
                                    <button onClick={() => setLog([])} style={{ fontSize: 11, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}>Effacer</button>
                                </div>
                                <div style={{ background: '#0F172A', borderRadius: 10, padding: 12, maxHeight: 200, overflow: 'auto', border: '1px solid #1E293B' }}>
                                    {log.length === 0 ? (
                                        <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>Aucun événement pour l&apos;instant...</p>
                                    ) : (
                                        log.map((l, i) => (
                                            <div key={i} style={{ fontSize: 11, color: '#94A3B8', padding: '4px 0', borderBottom: i < log.length - 1 ? '1px solid #1E293B' : 'none', fontFamily: 'monospace' }}>{l}</div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
