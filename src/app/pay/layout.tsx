import type { Metadata, Viewport } from "next";
import { Inter_Tight, Instrument_Serif } from "next/font/google";

// Meme charte que le checkout : Inter Tight pour le texte, Instrument Serif
// pour le montant mis en avant.
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", variable: "--font-instrument-serif", display: "swap" });

export const metadata: Metadata = {
    title: "Paiement sécurisé : Cartflox",
    description: "Réglez votre commande en toute sécurité par Mobile Money ou carte bancaire.",
    robots: { index: false, follow: false },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
};

export default function PayLayout({ children }: { children: React.ReactNode }) {
    return (
        <div
            className={`${interTight.variable} ${instrumentSerif.variable}`}
            style={{ fontFamily: "var(--font-inter-tight), Inter, system-ui, sans-serif" }}
        >
            {children}
        </div>
    );
}
