import type { Metadata, Viewport } from "next";
import { Inter_Tight, Instrument_Serif } from "next/font/google";

// Meme charte que la page d'accueil de cartflox.com : Inter Tight pour le
// texte, Instrument Serif pour le montant mis en avant.
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument-serif", display: "swap" });

export const metadata: Metadata = {
    title: "Paiement sécurisé : Cartflox",
    description: "Effectuez votre paiement en toute sécurité.",
    robots: { index: false, follow: false },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
    return (
        <div
            className={`${interTight.variable} ${instrumentSerif.variable}`}
            style={{ fontFamily: "var(--font-inter-tight), Inter, system-ui, sans-serif" }}
        >
            {children}
        </div>
    );
}
