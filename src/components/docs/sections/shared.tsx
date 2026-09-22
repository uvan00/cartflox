"use client";

import { ArrowRight } from "lucide-react";
import type { SectionId } from "@/app/docs/page";

export function H1({ children }: { children: React.ReactNode }) {
    return <h1 className="text-3xl font-bold text-white tracking-tight leading-tight mb-3">{children}</h1>;
}
export function H2({ children }: { children: React.ReactNode }) {
    return <h2 className="text-xl font-semibold text-white mt-10 mb-3 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>{children}</h2>;
}
export function H3({ children }: { children: React.ReactNode }) {
    return <h3 className="text-[15px] font-semibold text-white mt-6 mb-2">{children}</h3>;
}
export function P({ children }: { children: React.ReactNode }) {
    return <p className="text-[14px] leading-relaxed mb-3" style={{ color: "rgba(161,161,170,1)" }}>{children}</p>;
}
export function InlineCode({ children }: { children: React.ReactNode }) {
    return (
        <code className="font-mono text-[12px] px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.08)", color: "rgba(52,211,153,1)" }}>
            {children}
        </code>
    );
}
export function SectionBadge({ children, color = "green" }: { children: React.ReactNode; color?: string }) {
    const c: Record<string, { bg: string; text: string; border: string }> = {
        green:  { bg: "rgba(52,211,153,0.08)",  text: "rgba(52,211,153,1)",   border: "rgba(52,211,153,0.15)" },
        blue:   { bg: "rgba(96,165,250,0.08)",  text: "rgba(96,165,250,1)",   border: "rgba(96,165,250,0.15)" },
        purple: { bg: "rgba(168,85,247,0.08)",  text: "rgba(192,132,252,1)",  border: "rgba(168,85,247,0.15)" },
        amber:  { bg: "rgba(251,191,36,0.08)",  text: "rgba(251,191,36,1)",   border: "rgba(251,191,36,0.15)" },
    };
    const s = c[color] || c.green;
    return (
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-medium mb-5" style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}>
            {children}
        </div>
    );
}
export function NavButtons({ prev, next, setSection }: {
    prev?: { id: SectionId; label: string };
    next?: { id: SectionId; label: string };
    setSection: (s: SectionId) => void;
}) {
    return (
        <div className="flex items-center justify-between mt-12 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            {prev ? (
                <button onClick={() => setSection(prev.id)} className="flex items-center gap-2 text-[13px] transition-opacity hover:opacity-70" style={{ color: "rgba(161,161,170,1)" }}>
                    <ArrowRight className="h-3.5 w-3.5 rotate-180" /> {prev.label}
                </button>
            ) : <div />}
            {next ? (
                <button onClick={() => setSection(next.id)} className="flex items-center gap-2 text-[13px] font-medium text-white transition-opacity hover:opacity-70">
                    {next.label} <ArrowRight className="h-3.5 w-3.5" />
                </button>
            ) : <div />}
        </div>
    );
}
