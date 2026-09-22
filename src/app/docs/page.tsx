"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { MARQUE, MARQUE_ICONE } from "@/lib/marque";
import { DocsSidebar } from "@/components/docs/sidebar";
import { DocsContent } from "@/components/docs/content";

export type SectionId =
    | "introduction" | "quickstart" | "authentication"
    | "payments-create" | "payments-verify" | "payments-list" | "payments-refund"
    | "transfers"
    | "smart-routing"
    | "webhooks-setup" | "webhooks-events" | "webhooks-security"
    | "sdks-node" | "sdks-python" | "sdks-php" | "sdks-flutter"
    | "plugins-woo" | "errors" | "rate-limits" | "changelog";

export default function DocsPage() {
    const [activeSection, setActiveSection] = useState<SectionId>("introduction");
    const [mobileNav, setMobileNav] = useState(false);

    return (
        <main className="min-h-screen font-sans" style={{ background: "#111111" }}>
            <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#111111]/90 px-5 backdrop-blur">
                <Link href="/" className="flex items-center gap-2 text-white no-underline">
                    <img src={MARQUE_ICONE} alt="" className="h-7 w-7" />
                    <span className="text-[15px] font-semibold">{MARQUE}</span>
                    <span className="text-[13px] text-white/50">Documentation</span>
                </Link>
                <Link href="/dashboard" className="rounded-lg bg-white/10 px-3 py-1.5 text-[13px] font-medium text-white no-underline hover:bg-white/15">Tableau de bord</Link>
            </header>

            <div className="pt-20 flex min-h-screen">
                {/* Sidebar */}
                <DocsSidebar
                    activeSection={activeSection}
                    setActiveSection={setActiveSection}
                    mobileOpen={mobileNav}
                    setMobileOpen={setMobileNav}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <motion.div
                        key={activeSection}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25 }}
                        className="max-w-3xl mx-auto px-6 py-10"
                    >
                        <DocsContent section={activeSection} setSection={setActiveSection} />
                    </motion.div>
                </div>
            </div>
        </main>
    );
}
