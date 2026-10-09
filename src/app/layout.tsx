import { MARQUE, MARQUE_TITRE } from "@/lib/marque";
import { Poppins } from "next/font/google";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RechargeSiPerime } from "@/components/recharge-si-perime";
import { Providers } from "@/components/providers";
import { ChatSupport } from "@/components/dashboard/chat-support";
import { SuiviGoogle } from "@/components/suivi-google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
    title: MARQUE_TITRE,
    description: "La plateforme d'orchestration de paiements pour l'Afrique.",
    icons: {
        icon: [
            { url: '/icon.svg', type: 'image/svg+xml' },
        ],
        apple: '/apple-icon.svg',
    },
};

/** Police des tableaux de bord (la coque seulement). */
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--police-tableau", display: "swap" });

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="fr" className={`dark ${poppins.variable}`} suppressHydrationWarning>
            <head>
                {/* Pages de paiement (meme regle que estPagePaiement, lib/page-paiement.ts) :
                    ni le theme sombre du tableau de bord ni ses reglages, avant le
                    premier rendu. Sinon le fond noir du tableau de bord passait sous
                    la page du client (ecran noir avant le squelette sur iPhone). */}
                <script dangerouslySetInnerHTML={{ __html: `(function(){try{var h=document.documentElement,l=location;if(/^checkout\\./i.test(l.hostname)||l.pathname.indexOf('/checkout')===0||l.pathname.indexOf('/pay/')===0){h.classList.remove('dark');h.classList.add('light','page-paiement');return;}var t=localStorage.getItem('afriflow-dashboard-theme')||'dark';if(t==='light'){h.classList.remove('dark');h.classList.add('light');}else{h.classList.remove('light');h.classList.add('dark');}if(localStorage.getItem('afriflow-smooth-animations')==='false'){h.classList.add('no-animations');}}catch(e){}})();` }} />
            </head>
            <body className={`${inter.className} antialiased selection:bg-primary selection:text-black overflow-x-hidden`} suppressHydrationWarning>
        <RechargeSiPerime />
                {/* Fond decoratif. Deux degrades peints directement : aucune couche
                    filtree, aucune image externe. Les grands cercles flous
                    (blur 120 et 150 px) faisaient apparaitre un ecran noir sur
                    les telephones d'entree de gamme, le compositeur renoncant
                    a produire ces surfaces. Absent des pages de paiement, qu'il ne
                    ferait que colorer sous la page du client. */}
                <div
                    aria-hidden="true"
                    className="fond-decoratif fixed inset-0 pointer-events-none z-0"
                    style={{
                        backgroundImage:
                            "radial-gradient(680px 680px at 0% 0%, rgba(124,58,237,0.12), rgba(124,58,237,0) 70%)," +
                            "radial-gradient(900px 900px at 100% 100%, rgba(135,169,255,0.07), rgba(135,169,255,0) 70%)",
                    }}
                />

                <div className="relative z-10">
                    <Providers>
                        {children}
                        <ChatSupport />
                        <SuiviGoogle />
                    </Providers>
                </div>
            </body>
        </html>
    );
}
