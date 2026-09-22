"use client";

/* Derniere barriere du rendu.
 *
 * Sans ce fichier, une exception non rattrapee dans la mise en page
 * racine fait demonter tout l'arbre React par Next.js. Il ne reste
 * alors que <html class="dark"> et son fond : l'ecran noir signale
 * par les utilisateurs apres connexion.
 *
 * global-error.tsx doit fournir ses propres <html> et <body> : il
 * remplace la mise en page racine, il n'est pas rendu dedans. */

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="fr">
            <body
                style={{
                    alignItems: "center",
                    background: "#0b0c0e",
                    color: "#edeef0",
                    display: "flex",
                    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
                    justifyContent: "center",
                    margin: 0,
                    minHeight: "100vh",
                    padding: 24,
                }}
            >
                <main style={{ maxWidth: 460, textAlign: "center" }}>
                    <p style={{ color: "#777b84", fontSize: 12, letterSpacing: "0.08em", margin: 0, textTransform: "uppercase" }}>
                        Cartflox
                    </p>
                    <h1 style={{ fontSize: 20, fontWeight: 600, margin: "10px 0 8px" }}>
                        La page n&apos;a pas pu s&apos;afficher
                    </h1>
                    <p style={{ color: "#a1a5ad", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                        Une erreur est survenue de notre côté. Tes données et tes paiements ne sont
                        pas affectés. Réessaie&nbsp;: si le problème persiste, écris-nous en citant
                        le code ci-dessous.
                    </p>

                    <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}>
                        <button
                            onClick={() => reset()}
                            style={{
                                background: "#12a594",
                                border: "none",
                                borderRadius: 8,
                                color: "#fff",
                                cursor: "pointer",
                                fontSize: 14,
                                fontWeight: 500,
                                height: 38,
                                padding: "0 16px",
                            }}
                            type="button"
                        >
                            Réessayer
                        </button>
                        <a
                            href="/"
                            style={{
                                alignItems: "center",
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 8,
                                color: "#edeef0",
                                display: "inline-flex",
                                fontSize: 14,
                                height: 38,
                                padding: "0 16px",
                                textDecoration: "none",
                            }}
                        >
                            Retour à l&apos;accueil
                        </a>
                    </div>

                    {error?.digest ? (
                        <p style={{ color: "#5c6069", fontSize: 11, marginTop: 20 }}>
                            Code : {error.digest}
                        </p>
                    ) : null}
                </main>
            </body>
        </html>
    );
}
