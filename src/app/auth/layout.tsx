import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { MARQUE } from "@/lib/marque";

// Meme police que l'accueil de cartflox.com et que la page de paiement.
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });

export const metadata: Metadata = {
    title: `Votre compte ${MARQUE}`,
    description: `Connectez-vous à votre espace ${MARQUE} ou créez votre compte.`,
    robots: { index: false, follow: false },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className={interTight.variable} style={{ fontFamily: "var(--font-inter-tight), Inter, system-ui, sans-serif" }}>
            {children}
        </div>
    );
}
