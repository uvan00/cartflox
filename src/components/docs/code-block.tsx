"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg transition-all"
            style={{ color: copied ? "rgba(52,211,153,1)" : "rgba(113,113,122,1)", background: "rgba(255,255,255,0.05)" }}
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copié !" : "Copier"}
        </button>
    );
}

export function CodeBlock({ code, lang = "bash", title }: { code: string; lang?: string; title?: string }) {
    return (
        <div className="rounded-xl overflow-hidden my-4" style={{ background: "#0d0d0d", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/40" />
                    </div>
                    {title && <span className="text-[11px] font-mono" style={{ color: "rgba(113,113,122,1)" }}>{title}</span>}
                    {!title && <span className="text-[11px] font-mono" style={{ color: "rgba(63,63,70,1)" }}>{lang}</span>}
                </div>
                <CopyButton text={code} />
            </div>
            <div className="p-4 overflow-x-auto">
                <pre className="text-[13px] font-mono leading-relaxed whitespace-pre" style={{ color: "rgba(212,212,216,1)" }}>
                    {code}
                </pre>
            </div>
        </div>
    );
}

export function HttpBadge({ method }: { method: string }) {
    const colors: Record<string, { bg: string; text: string }> = {
        GET:    { bg: "rgba(59,130,246,0.12)", text: "rgba(96,165,250,1)" },
        POST:   { bg: "rgba(52,211,153,0.12)", text: "rgba(52,211,153,1)" },
        PUT:    { bg: "rgba(251,146,60,0.12)", text: "rgba(251,146,60,1)" },
        DELETE: { bg: "rgba(239,68,68,0.12)",  text: "rgba(248,113,113,1)" },
        PATCH:  { bg: "rgba(168,85,247,0.12)", text: "rgba(192,132,252,1)" },
    };
    const c = colors[method] || colors.GET;
    return (
        <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold font-mono"
            style={{ background: c.bg, color: c.text }}
        >
            {method}
        </span>
    );
}

export function ApiEndpoint({ method, path, description }: { method: string; path: string; description?: string }) {
    return (
        <div className="flex items-start gap-3 my-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <HttpBadge method={method} />
            <div className="flex-1 min-w-0">
                <code className="text-[13px] font-mono text-white">{path}</code>
                {description && <p className="text-[12px] mt-0.5" style={{ color: "rgba(113,113,122,1)" }}>{description}</p>}
            </div>
        </div>
    );
}

export function ParamTable({ params }: { params: { name: string; type: string; required?: boolean; desc: string }[] }) {
    return (
        <div className="my-4 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <table className="w-full text-[12px]">
                <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <th className="px-4 py-2.5 text-left font-semibold text-white">Paramètre</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-white">Type</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-white">Requis</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-white">Description</th>
                    </tr>
                </thead>
                <tbody>
                    {params.map((p, i) => (
                        <tr key={p.name} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined }}>
                            <td className="px-4 py-2.5"><code className="font-mono text-emerald-400">{p.name}</code></td>
                            <td className="px-4 py-2.5 font-mono" style={{ color: "rgba(168,85,247,0.9)" }}>{p.type}</td>
                            <td className="px-4 py-2.5">
                                {p.required
                                    ? <span className="text-red-400 font-medium">Oui</span>
                                    : <span style={{ color: "rgba(113,113,122,1)" }}>Non</span>
                                }
                            </td>
                            <td className="px-4 py-2.5" style={{ color: "rgba(161,161,170,1)" }}>{p.desc}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function AlertBox({ type, children }: { type: "info" | "warning" | "success" | "error"; children: React.ReactNode }) {
    const styles = {
        info:    { bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.2)",  text: "rgba(96,165,250,1)",   label: "ℹ Info" },
        warning: { bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.2)",  text: "rgba(251,191,36,1)",   label: "⚠ Attention" },
        success: { bg: "rgba(52,211,153,0.07)",  border: "rgba(52,211,153,0.2)",  text: "rgba(52,211,153,1)",   label: "✓ Bon à savoir" },
        error:   { bg: "rgba(239,68,68,0.07)",   border: "rgba(239,68,68,0.2)",   text: "rgba(248,113,113,1)",  label: "✕ Important" },
    };
    const s = styles[type];
    return (
        <div className="my-4 p-4 rounded-xl text-[13px] leading-relaxed" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
            <span className="font-semibold text-[12px] block mb-1.5" style={{ color: s.text }}>{s.label}</span>
            <span style={{ color: "rgba(212,212,216,1)" }}>{children}</span>
        </div>
    );
}
