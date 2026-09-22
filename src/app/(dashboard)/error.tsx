"use client";

import { useEffect } from "react";

/* Frontiere d'erreur du tableau de bord.
 *
 * La mise en page de ce groupe appelle getApplications() cote serveur.
 * Si l'appel echoue (base indisponible, compte tout juste cree par
 * Google dont la ligne n'existe pas encore), l'exception remontait
 * jusqu'a la racine sans rencontrer aucune frontiere : React demontait
 * l'arbre et l'utilisateur restait devant un ecran noir.
 *
 * Ici on garde une page lisible, et on offre de reessayer sans avoir a
 * se reconnecter. */

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Trace cote navigateur : l'exception serveur n'apparait pas
        // autrement dans les outils de developpement.
        console.error("[tableau de bord] rendu interrompu :", error);
    }, [error]);

    return (
        <div
            style={{
                alignItems: "center",
                display: "flex",
                justifyContent: "center",
                minHeight: "70vh",
                padding: 24,
            }}
        >
            <div
                style={{
                    background: "var(--dt-card-bg, #18191b)",
                    border: "1px solid var(--dt-border, rgba(255,255,255,0.08))",
                    borderRadius: 12,
                    maxWidth: 460,
                    padding: 28,
                    textAlign: "center",
                    width: "100%",
                }}
            >
                <h2
                    style={{
                        color: "var(--dt-text-primary, #edeef0)",
                        fontSize: 16,
                        fontWeight: 600,
                        margin: "0 0 8px",
                    }}
                >
                    Ton tableau de bord n&apos;a pas pu se charger
                </h2>
                <p
                    style={{
                        color: "var(--dt-text-muted, #777b84)",
                        fontSize: 13,
                        lineHeight: 1.6,
                        margin: 0,
                    }}
                >
                    Tu es bien connecté. C&apos;est l&apos;affichage qui a échoué, pas ton compte :
                    tes paiements et tes transactions sont intacts.
                </p>

                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
                    <button
                        onClick={() => reset()}
                        style={{
                            background: "var(--dt-brand, #12a594)",
                            border: "none",
                            borderRadius: 8,
                            color: "#fff",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 500,
                            height: 36,
                            padding: "0 16px",
                        }}
                        type="button"
                    >
                        Réessayer
                    </button>
                    <a
                        href="/transactions"
                        style={{
                            alignItems: "center",
                            border: "1px solid var(--dt-border, rgba(255,255,255,0.12))",
                            borderRadius: 8,
                            color: "var(--dt-text-primary, #edeef0)",
                            display: "inline-flex",
                            fontSize: 13,
                            height: 36,
                            padding: "0 16px",
                            textDecoration: "none",
                        }}
                    >
                        Mes transactions
                    </a>
                </div>

                {error?.digest ? (
                    <p style={{ color: "var(--dt-text-muted, #5c6069)", fontSize: 11, marginTop: 18 }}>
                        Code : {error.digest}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
