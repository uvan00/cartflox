// Écran de chargement de marque pour le dashboard.
// Le logo Cartflox est fait de deux blocs : le chevron foncé (ancre) et le bloc
// clair qui vient « se positionner » pour compléter le logo — animation
// d'assemblage en boucle (pas un simple zoom).
export default function DashboardLoading() {
    return (
        <div className="flex min-h-[70vh] w-full items-center justify-center">
            <div className="cf-asm relative" aria-label="Chargement Cartflox" role="img">
                <span className="cf-asm-glow" aria-hidden="true" />
                {/* Bloc gauche — chevron foncé (ancre) */}
                <svg className="cf-asm-blk cf-asm-left" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M0 0 L6 0 L14 12 L6 24 L0 24 Z" fill="#6D28D9" />
                </svg>
                {/* Bloc droit — vient se positionner */}
                <svg className="cf-asm-blk cf-asm-right" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M9 0 L24 0 L24 24 L9 24 L17 12 Z" fill="#A855F7" />
                </svg>
            </div>

            <span className="sr-only">Chargement…</span>

            <style>{`
                .cf-asm { width: 68px; height: 68px; }
                .cf-asm-blk { position: absolute; inset: 0; width: 100%; height: 100%; }
                @keyframes cf-asm-right {
                    0%   { opacity: 0; transform: translateX(22px); }
                    24%  { opacity: 1; transform: translateX(0); }
                    72%  { opacity: 1; transform: translateX(0); }
                    100% { opacity: 0; transform: translateX(22px); }
                }
                @keyframes cf-asm-left {
                    0%   { opacity: 0.3; }
                    24%  { opacity: 1; }
                    72%  { opacity: 1; }
                    100% { opacity: 0.3; }
                }
                @keyframes cf-asm-glow {
                    0%, 100% { opacity: 0; transform: scale(0.7); }
                    24%, 72% { opacity: 0.5; transform: scale(1.15); }
                }
                .cf-asm-left  { animation: cf-asm-left 1.9s ease infinite; }
                .cf-asm-right { animation: cf-asm-right 1.9s cubic-bezier(0.22, 1, 0.36, 1) infinite; }
                .cf-asm-glow {
                    position: absolute; inset: -55%; border-radius: 9999px;
                    background: radial-gradient(circle, rgba(124,58,237,0.45), rgba(124,58,237,0) 70%);
                    filter: blur(18px);
                    animation: cf-asm-glow 1.9s ease infinite;
                }
                @media (prefers-reduced-motion: reduce) {
                    .cf-asm-left, .cf-asm-right, .cf-asm-glow { animation: none; opacity: 1; transform: none; }
                    .cf-asm-glow { opacity: 0.4; }
                }
            `}</style>
        </div>
    );
}
